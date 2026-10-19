import React, { createContext, useContext } from 'react';
import { useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { lerp, prog, win } from '../lib';
import timeline from '../timeline.json';
import { Callout, Caption, Cursor, CursorKey, DemoLabel, Logo, MailBackground, Shell } from '../components/ui';
import { EvidenceView, PanelFrame, PanelHeader, ResultView } from '../components/panel';
import type { Facts } from '../facts';

export const FactsContext = createContext<Facts>(null as unknown as Facts);
const useFacts = () => useContext(FactsContext);

const scene = (id: string) => timeline.scenes.find((s) => s.id === id)!;
// timeline.json holds global frames; scene components run on local frames
const captions = (id: string) => scene(id).captions.map((c) => <Caption key={c.text} text={c.text} from={c.from - scene(id).from} to={c.to - scene(id).from} />);

// ----- the panel as a camera: 420 px wide design, drawn at s (2.4 by default). The header stays fixed. -----
type Cam = { s: number; tx: number; ty: number };
const cam = (panY: number, s = 2.4, tx = 912): Cam => ({ s, tx, ty: -panY * s });
const toCanvas = (c: Cam, x: number, y: number) => ({ x: c.tx + x * c.s, y: c.ty + y * c.s });
const PanelCam: React.FC<{ c: Cam; children: React.ReactNode }> = ({ c, children }) => (
  <>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 420, transformOrigin: '0 0', transform: `translate(${c.tx}px, ${c.ty}px) scale(${c.s})` }}>
      <div style={{ position: 'relative' }}><PanelFrame>{children}</PanelFrame></div>
    </div>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 420, height: 48, zIndex: 5, transformOrigin: '0 0', transform: `translate(${c.tx}px, 0px) scale(${c.s})` }}><PanelHeader /></div>
  </>
);
const keysAt = (cams: (f: number) => Cam, keys: { f: number; x: number; y: number; press?: boolean }[]): CursorKey[] =>
  keys.map((k) => ({ ...k, ...toCanvas(cams(k.f), k.x, k.y) }));

// design y (in the panel's 420 px layout) of the parts the callouts point at
const TARGETS = { governance: 345, bias: 575, footer: 610 };

// ===== S1: the complaint arrives =====
export const S1: React.FC = () => {
  const f = useCurrentFrame();
  return <Shell><MailBackground zoom={1 + 0.03 * prog(f, 0, 90)} />{captions('S1')}</Shell>;
};

// ===== S2: the panel slides in; the result; a finding becomes the next step; bias, governance and policy =====
export const S2: React.FC = () => {
  const f = useCurrentFrame(); const facts = useFacts();
  const slide = prog(f, 0, 14);
  const zin = prog(f, 22, 44), zout = prog(f, 84, 106);
  const s = lerp(lerp(2.4, 3.2, zin), 2.4, zout);
  const cx = lerp(lerp(912 + 210 * 2.4, 960, zin), 912 + 210 * 2.4, zout);
  const panY = lerp(lerp(0, 36, zin), 230, zout);
  const c: Cam = { s, tx: lerp(1920, cx - 210 * s, slide), ty: -panY * s };
  const end = cam(230); // where the camera rests while the checks are named
  const at = (x: number, y: number) => toCanvas(end, x, y);
  const L = facts.labels.callouts;
  return <Shell>
    <MailBackground opacity={1 - 0.7 * prog(f, 0, 14)} />
    <PanelCam c={c}><ResultView footer={facts.labels.footer} facts={facts} stampP={prog(f, 12, 26)} alsoP={[0, 1, 2].map((i) => prog(f, 104 + i * 12, 118 + i * 12))} collapsedP={prog(f, 138, 148)} /></PanelCam>
    <Callout label={L.governance} from={150} to={190} at={{ x: 480, y: at(0, TARGETS.governance).y - 35 }} width={330} target={{ x: 930, y: at(0, TARGETS.governance).y }} />
    <Callout label={L.bias} from={168} to={208} at={{ x: 480, y: 580 }} width={330} target={{ x: 930, y: at(0, TARGETS.bias).y }} />
    <Callout label={L.policy} from={186} to={220} at={{ x: 480, y: 690 }} width={330} target={{ x: 930, y: at(0, TARGETS.footer).y }} />
    <DemoLabel text={facts.labels.demo} />{captions('S2')}
  </Shell>;
};

// ===== S3: the main step. Agreed vs billed, quoted from the files, then the rule =====
export const S3: React.FC = () => {
  const f = useCurrentFrame(); const facts = useFacts();
  const camAt = (ff: number): Cam => cam(lerp(0, 150, prog(ff, 112, 148)));
  const copy = prog(f, 196, 206), pressed = f >= 206;
  return <Shell>
    <MailBackground opacity={0.3} />
    <PanelCam c={camAt(f)}>
      <EvidenceView ev={facts.evidence.approve} itemsP={[prog(f, 10, 24), prog(f, 40, 54)]} ruleP={prog(f, 100, 114)} copyHot={copy} copied={f >= 214} />
    </PanelCam>
    <Cursor visible={prog(f, 170, 180) * (1 - prog(f, 214, 224))} keys={keysAt(camAt, [{ f: 170, x: 330, y: 330 }, { f: 204, x: 70, y: 468, press: true }, { f: 224, x: 160, y: 520 }])} />
    <DemoLabel text={facts.labels.demo} />{captions('S3')}
  </Shell>;
};

// ===== S4: personal details stay masked; each quote is checked against its file =====
export const S4: React.FC = () => {
  const f = useCurrentFrame(); const facts = useFacts();
  const c = cam(40 * prog(f, 72, 96) + 150 * prog(f, 150, 190));
  return <Shell>
    <MailBackground opacity={0.3} />
    <PanelCam c={c}>
      <EvidenceView ev={facts.evidence.privacy} itemsP={[prog(f, 10, 24), prog(f, 28, 42), prog(f, 46, 60)]} ruleP={prog(f, 150, 164)} />
    </PanelCam>
    <DemoLabel text={facts.labels.demo} />{captions('S4')}
  </Shell>;
};

// ===== S5: end card =====
export const S5: React.FC = () => {
  const f = useCurrentFrame(); const facts = useFacts();
  const e = facts.labels.end;
  return <Shell>
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', display: 'grid', gap: 26, justifyItems: 'center' }}>
        <div style={{ opacity: prog(f, 6, 20), transform: `translateY(${(1 - prog(f, 6, 20)) * 14}px)`, display: 'flex', alignItems: 'center', gap: 28 }}><Logo size={120} /><span style={{ fontSize: 120, fontWeight: 700 }}>{e[0]}</span></div>
        <div style={{ fontSize: 52, fontWeight: 600, opacity: prog(f, 24, 38), transform: `translateY(${(1 - prog(f, 24, 38)) * 12}px)` }}>{e[1]}</div>
        <div style={{ marginTop: 40, fontSize: 28, fontWeight: 600, color: C.muted, opacity: prog(f, 50, 62) }}>{e[2]} &nbsp; {e[3]}</div>
      </div>
    </div>
  </Shell>;
};
