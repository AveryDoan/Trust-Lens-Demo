import React, { createContext, useContext } from 'react';
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { lerp, prog } from '../lib';
import timeline from '../data/timeline60.json';
import { Caption, DemoLabel, Logo } from '../components/ui';
import { ChipsRow, PanelFrame, PanelHeader, ProvenanceView, ReadingView, ResultView, ReviewView } from '../components/panel';
import { AccountsFocus, AssessView, ConsentView, PathView60, RushCalc, StampRule, ToolsView } from '../components/panel60';
import { BASE, BOXES, CamProvider, CaptionsOn, Highlight, Outline, PANEL_W, SHOT, SceneFrom, ShotCursor, ShotLayer, panelOpen, sceneClip, useCam, useG, useShotCam } from '../components/shot';
import type { Facts } from '../facts';

export const FactsContext = createContext<Facts>(null as unknown as Facts);
const useFacts = () => useContext(FactsContext);

const scene = (id: string) => timeline.scenes.find((s) => s.id === id)!;
// captions are in global frames in the data; the Sequence gives local frames
const Captions: React.FC<{ id: string }> = ({ id }) => {
  const on = useContext(CaptionsOn);
  if (!on) return null;
  const sc = scene(id);
  return <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }}>{sc.captions.map((c) => <Caption key={c.text} text={c.text} from={c.from - sc.from} to={c.to - sc.from} />)}</div>;
};
const Top: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: 'none' }}>{children}</div>;
const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#FFFFFF', fontFamily: FONT, color: C.foreground, colorScheme: 'light' }}>{children}</div>
);

// ----- the docked panel: 420 px drawn at `s` (2.2), header fixed, body scrolls by panY -----
type PCam = { s: number; tx: number; ty: number };
const panelCam = (g: number, panY: number, s = timeline.panel.scale): PCam => ({ s, tx: 1920 - 420 * s * panelOpen(g), ty: -panY * s });
const toCanvas = (c: PCam, x: number, y: number) => ({ x: c.tx + x * c.s, y: c.ty + y * c.s });
const Dock: React.FC<{ c: PCam; children: React.ReactNode }> = ({ c, children }) => (
  <>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 420, transformOrigin: '0 0', transform: `translate(${c.tx}px, ${c.ty}px) scale(${c.s})` }}>
      <div style={{ position: 'relative' }}><PanelFrame>{children}</PanelFrame></div>
    </div>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 420, height: 48, zIndex: 5, transformOrigin: '0 0', transform: `translate(${c.tx}px, 0px) scale(${c.s})` }}><PanelHeader /></div>
  </>
);

// a cursor in canvas pixels, keyed in global frames; points are given in panel design coordinates and mapped through the panel camera of that frame
type PKey = { f: number; x: number; y: number; press?: boolean };
const PanelCursor: React.FC<{ keys: PKey[]; cams: (g: number) => PCam; visible?: number }> = ({ keys, cams, visible = 1 }) => {
  const g = useG();
  if (visible <= 0) return null;
  const pts = keys.map((k) => ({ ...k, ...toCanvas(cams(k.f), k.x, k.y) }));
  const o = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) } as const;
  const fs = pts.map((k) => k.f);
  const x = interpolate(g, fs, pts.map((k) => k.x), o), y = interpolate(g, fs, pts.map((k) => k.y), o);
  const down = pts.some((k) => k.press && g >= k.f && g < k.f + 6);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: visible, pointerEvents: 'none', zIndex: 30 }}>
      {pts.filter((k) => k.press).map((k) => { const t = (g - k.f) / 14; return t < 0 || t > 1 ? null : <div key={k.f} style={{ position: 'absolute', left: -28 * t, top: -28 * t, width: 56 * t, height: 56 * t, borderRadius: '50%', border: `3px solid ${C.accent}`, opacity: 1 - t }} />; })}
      <svg width="40" height="46" viewBox="0 0 34 40" style={{ position: 'absolute', left: -4, top: -3, transform: `scale(${down ? 0.88 : 1})`, transformOrigin: '4px 3px' }}>
        <path d="M4 3 L4 31 L11 25 L16 36 L21 34 L16 23 L26 23 Z" fill={C.foreground} stroke="#FFFFFF" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ----- a simulated document page: the invoice as the AI sees it (pii.js has masked it; the tags are the masks) -----
const DocPage: React.FC<{ name: string; label?: string; labelP: number; paragraphs: { text: string; mark?: boolean; tag?: boolean }[][]; p: number; markP: number }> = ({ name, label, labelP, paragraphs, p, markP }) => (
  <div style={{ position: 'absolute', left: 64, top: 70, width: 868, background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: '0 2px 14px rgba(30,35,33,0.12)', padding: '30px 44px', opacity: p, transform: `translateY(${(1 - p) * 18}px)`, overflow: 'hidden', zIndex: 8 }}>
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 12, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
      <span style={{ fontSize: 24, fontWeight: 700 }}>{name}</span>
      {label && <span style={{ fontSize: 22, fontWeight: 700, color: C.accent, opacity: labelP }}>{label}</span>}
    </div>
    {paragraphs.map((para, i) => (
      <p key={i} style={{ fontSize: 27, lineHeight: 1.5, margin: '0 0 22px' }}>
        {para.map((t, j) => t.mark
          ? <span key={j} style={{ background: `rgba(255, 214, 0, ${0.35 * markP})`, borderBottom: `3px solid rgba(43,74,122,${markP})`, fontWeight: 600 }}>{t.text}</span>
          : t.tag ? <span key={j} style={{ background: C.foreground, color: C.accentFg, fontWeight: 700, padding: '0 6px', borderRadius: 4 }}>{t.text}</span> : <span key={j}>{t.text}</span>)}
      </p>
    ))}
  </div>
);
const TAG = /(\[(?:EMAIL|PHONE|TFN|CARD|DOB|ADDRESS)\])/;
const withTags = (s: string) => s.split(TAG).filter(Boolean).map((t) => (TAG.test(t) ? { text: t, tag: true } : { text: t }));

// ===== S1: what a person normally does with a long email =====
export const S1: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S1');
  const badge = cam.toCanvas(606, 724);
  return (
    <Stage>
      <CamProvider value={cam}>
        <ShotLayer clip={clip}>
          <Outline id="agreement" from={242} to={264} /><Outline id="invoice" from={260} to={282} /><Outline id="thread" from={278} to={299} />
        </ShotLayer>
        {!clip && <ShotCursor visible={prog(g, 232, 240)} keys={[{ f: 232, x: 760, y: 690 }, { f: 246, x: 160, y: 776 }, { f: 264, x: 336, y: 776 }, { f: 282, x: 513, y: 776 }, { f: 299, x: 560, y: 800 }]} />}
        {!clip && g >= 238 && <div style={{ position: 'absolute', left: badge.x, top: badge.y, fontSize: 30, fontWeight: 700, padding: '4px 18px', border: `2px solid ${C.accent}`, color: C.accent, background: '#FFFFFF', borderRadius: 4, opacity: prog(g, 238, 250), transform: `translateY(${(1 - prog(g, 238, 250)) * 10}px)` }}>{facts.labels.counter}</div>}
      </CamProvider>
      <Captions id="S1" />
    </Stage>
  );
};

// ===== S2: one click opens TrustLens =====
export const S2: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S2');
  const pc = (gg: number) => panelCam(gg, 0);
  return (
    <Stage>
      <CamProvider value={cam}>
        <ShotLayer clip={clip}><Outline id="toolbar" from={334} to={356} /></ShotLayer>
        {!clip && <ShotCursor visible={prog(g, 322, 330) * (1 - prog(g, 366, 376))} keys={[{ f: 322, x: 1250, y: 200 }, { f: 344, x: 1519, y: 28 }, { f: 346, x: 1519, y: 28, press: true }, { f: 376, x: 1519, y: 28 }]} />}
      </CamProvider>
      {!clip && panelOpen(g) > 0 && <Dock c={pc(g)}><ToolsView facts={facts} p={[0, 1, 2, 3, 4].map((i) => prog(g, 386 + i * 12, 398 + i * 12))} /></Dock>}
      <Captions id="S2" />
    </Stage>
  );
};

// ===== S3: it asks first, then the review before AI =====
export const S3: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S3');
  const consent = g < 540;
  const panY = consent ? 0 : lerp(0, 0, 0);
  const pc = (gg: number) => panelCam(gg, gg < 540 ? 0 : 60);
  return (
    <Stage>
      <CamProvider value={cam}><ShotLayer clip={clip} /></CamProvider>
      {!clip && <>
        <Dock c={pc(g)}>
          {consent
            ? <ConsentView facts={facts} rowP={[452, 466, 480, 494, 500].map((a) => prog(g, a, a + 12))} tickP={[prog(g, 474, 480), prog(g, 488, 494)]} allowHot={prog(g, 514, 522)} pressed={g >= 524 && g < 532} />
            : g < 592
              ? <ReviewView facts={facts} rowsP={prog(g, 542, 556)} summaryP={prog(g, 552, 566)} discP={0} runHot={prog(g, 566, 576)} pressRun={g >= 588 && g < 594} />
              : <ReadingView facts={facts} ticks={4 * prog(g, 594, 642)} />}
        </Dock>
        <PanelCursor cams={pc} visible={prog(g, 500, 508) * (1 - prog(g, 536, 540)) + (g >= 540 ? prog(g, 570, 578) * (1 - prog(g, 598, 606)) : 0)}
          keys={[{ f: 500, x: 330, y: 330 }, { f: 520, x: 45, y: 262 }, { f: 524, x: 45, y: 262, press: true }, { f: 538, x: 45, y: 262 }, { f: 570, x: 300, y: 300 }, { f: 586, x: 60, y: 440 }, { f: 588, x: 60, y: 440, press: true }, { f: 606, x: 60, y: 440 }]} />
      </>}
      <Captions id="S3" />
    </Stage>
  );
};

// ===== S4: the assessment first (four checks), then bias, misinformation, needs checking =====
export const S4: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S4');
  const state = g < 720 ? 'list' : g < 830 ? 'bias' : g < 960 ? 'mis' : 'needs';
  const rowsP = [0, 1, 2, 3].map((i) => prog(g, 652 + i * 10, 664 + i * 10));
  const open = state === 'list' ? 'none' : state === 'bias' ? 'bias' : 'accuracy';
  const contentP = state === 'bias' ? [prog(g, 724, 736), prog(g, 732, 746)] : state === 'mis' ? [prog(g, 834, 846), prog(g, 846, 860)] : [prog(g, 964, 976), prog(g, 976, 990)];
  const pc = (gg: number) => panelCam(gg, gg < 830 ? 0 : 60);
  return (
    <Stage>
      <CamProvider value={cam}>
        <ShotLayer clip={clip}>
          <Highlight id="bias" from={756} to={826} />
          <Highlight id="clause6" from={862} to={956} />
          <Highlight id="multiple" from={992} to={1046} />
        </ShotLayer>
      </CamProvider>
      {!clip && <>
        <div style={{ position: 'absolute', left: 0, top: 0, width: cam.vw, height: 1080, background: 'rgba(255,255,255,0.55)', opacity: prog(g, 650, 658) * (1 - prog(g, 714, 728)), zIndex: 3, pointerEvents: 'none' }} />
        <Dock c={pc(g)}>
          <ChipsRow facts={facts} />
          <AssessView facts={facts} rowsP={rowsP} open={open as any} sub={state === 'mis' ? 'Misinformation' : state === 'needs' ? 'Needs checking' : null} contentP={contentP} tagsP={prog(g, 678, 690)} />
        </Dock>
        <PanelCursor cams={pc} visible={prog(g, 716, 722) * (1 - prog(g, 742, 750))} keys={[{ f: 716, x: 330, y: 300 }, { f: 728, x: 60, y: 126 }, { f: 730, x: 60, y: 126, press: true }, { f: 748, x: 60, y: 126 }]} />
        <Top><DemoLabel text={facts.labels.demo} /></Top>
      </>}
      <Captions id="S4" />
    </Stage>
  );
};

// ===== S5: the attachments: the invoice, invoice against agreement, where the invoice came from =====
export const S5: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S5');
  const inv = facts.sixty.pages.invoiceFull;
  const quote = facts.sixty.rush.billed.text;
  const at = inv.masked.indexOf(quote);
  const page = [[...withTags(inv.masked.slice(0, at)), { text: quote, mark: true }, ...withTags(inv.masked.slice(at + quote.length))]];
  const state = g < 1140 ? 'mis' : g < 1290 ? 'calc' : 'prov';
  const pc = (gg: number) => panelCam(gg, 0);
  return (
    <Stage>
      <CamProvider value={cam}>
        <ShotLayer clip={clip}><Highlight id="invoice" from={1080} to={1120} /></ShotLayer>
      </CamProvider>
      {!clip && <>
        {g >= 1100 && <div style={{ position: 'absolute', left: 0, top: 0, width: 996, height: 1080, background: 'rgba(250,246,238,0.92)', zIndex: 7, opacity: prog(g, 1100, 1110) }} />}
        {g >= 1100 && <DocPage name={inv.name} label={facts.labels.seeAI} labelP={prog(g, 1290, 1302)} paragraphs={page} p={prog(g, 1100, 1114)} markP={prog(g, 1118, 1130) * (1 - prog(g, 1290, 1300))} />}
        <Dock c={pc(g)}>
          {state === 'mis' && <div><ChipsRow facts={facts} /><AssessView facts={facts} rowsP={[1, 1, 1, 1]} open="misleading" contentP={[prog(g, 1100, 1114)]} tagsP={0} /></div>}
          {state === 'calc' && <RushCalc facts={facts} p={[prog(g, 1144, 1158), ...[0, 1, 2, 3, 4].map((i) => prog(g, 1170 + i * 14, 1184 + i * 14))]} finalHot={prog(g, 1244, 1256)} />}
          {state === 'prov' && <div><ChipsRow facts={facts} hot={prog(g, 1292, 1302)} /><ProvenanceView facts={facts} p={prog(g, 1298, 1312)} /></div>}
        </Dock>
        <Top><DemoLabel text={facts.labels.demo} /></Top>
      </>}
      <Captions id="S5" />
    </Stage>
  );
};

// ===== S6: only now the recommended next step; the path; the accounts-team step; the end card =====
export const S6: React.FC = () => {
  const g = useG(); const cam = useShotCam(); const facts = useFacts();
  const clip = sceneClip('S6');
  const e = facts.labels.end60;
  const pcAt = (gg: number): PCam => {
    if (gg < 1556) return panelCam(gg, 0);
    const z = lerp(lerp(2.2, 2.5, prog(gg, 1556, 1580)), 2.2, prog(gg, 1696, 1708));
    const panY = lerp(lerp(lerp(0, 40, prog(gg, 1556, 1580)), 190, prog(gg, 1600, 1624)), 390, prog(gg, 1680, 1700));
    return panelCam(gg, panY, z);
  };
  const end = prog(g, 1710, 1718);
  const assessFade = 1 - prog(g, 1410, 1422);
  return (
    <Stage>
      <CamProvider value={cam}><ShotLayer clip={clip} /></CamProvider>
      {!clip && <>
        <Dock c={pcAt(g)}>
          {g < 1516 && (
            <div style={{ position: 'relative' }}>
              {g >= 1418 && <StampRule facts={facts} stampP={prog(g, 1420, 1432)} ruleP={prog(g, 1446, 1458)} copyHot={prog(g, 1468, 1476)} seeHot={prog(g, 1498, 1506)} pressSee={g >= 1508 && g < 1514} />}
              {g < 1424 && <div style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: assessFade, pointerEvents: 'none' }}><ChipsRow facts={facts} /><AssessView facts={facts} rowsP={[1, 1, 1, 1]} open="accuracy" sub={null} contentP={[1]} tagsP={1} /></div>}
            </div>
          )}
          {g >= 1516 && g < 1560 && <PathView60 facts={facts} p={[0, 1, 2, 3].map((i) => prog(g, 1518 + i * 10, 1530 + i * 10))} />}
          {g >= 1560 && <AccountsFocus facts={facts} beats={[prog(g, 1562, 1574), prog(g, 1592, 1604), prog(g, 1622, 1634), prog(g, 1652, 1664)]} dim={prog(g, 1560, 1572)} whoP={prog(g, 1684, 1696)} whoHot={prog(g, 1694, 1704)} />}
        </Dock>
        <PanelCursor cams={pcAt} visible={prog(g, 1496, 1502) * (1 - prog(g, 1516, 1524))} keys={[{ f: 1496, x: 300, y: 330 }, { f: 1506, x: 60, y: 262 }, { f: 1508, x: 60, y: 262, press: true }, { f: 1524, x: 60, y: 262 }]} />
        <Top><DemoLabel text={facts.labels.demo} /></Top>
      </>}
      <Captions id="S6" />
      <div style={{ position: 'absolute', inset: 0, background: C.background, opacity: end, display: 'grid', placeItems: 'center', zIndex: 70 }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: 26, justifyItems: 'center' }}>
          <div style={{ opacity: prog(g, 1720, 1734), transform: `translateY(${(1 - prog(g, 1720, 1734)) * 14}px)`, display: 'flex', alignItems: 'center', gap: 28 }}><Logo size={120} /><span style={{ fontSize: 120, fontWeight: 700 }}>{e[0]}</span></div>
          <div style={{ fontSize: 52, fontWeight: 600, opacity: prog(g, 1746, 1760), transform: `translateY(${(1 - prog(g, 1746, 1760)) * 12}px)` }}>{e[1]}</div>
          <div style={{ marginTop: 40, fontSize: 28, fontWeight: 600, color: C.muted, opacity: prog(g, 1772, 1784) }}>{e[2]} &nbsp; {e[3]}</div>
        </div>
      </div>
    </Stage>
  );
};

// ===== a still that draws every highlight box over the screenshot, for checking =====
export const Boxes60: React.FC = () => {
  const S = BASE;
  const ox = (1920 - SHOT.width * S) / 2, oy = (1080 - SHOT.height * S) / 2;
  const colours = ['#B3261E', '#2B4A7A', '#774C00'];
  return (
    <Stage>
      <div style={{ position: 'absolute', left: ox, top: oy, width: SHOT.width, height: SHOT.height, transformOrigin: '0 0', transform: `scale(${S})` }}>
        <Img src={staticFile('screens/gmail-complaint.png')} style={{ width: SHOT.width, height: SHOT.height, display: 'block' }} />
        {Object.entries(BOXES).map(([id, b], i) => {
          const [x1, y1, x2, y2] = b.box;
          return (
            <div key={id} style={{ position: 'absolute', left: x1, top: y1, width: x2 - x1, height: y2 - y1, border: `1.5px solid ${colours[i % 3]}`, background: 'rgba(255, 214, 0, 0.35)' }}>
              <span style={{ position: 'absolute', left: 0, top: -14, fontSize: 11, fontWeight: 700, color: colours[i % 3], background: '#fff', padding: '0 3px' }}>{id}</span>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
