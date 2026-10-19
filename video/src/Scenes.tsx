import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';
import { C, FONT } from './theme';
import { prog, window_ } from './lib';
import { script, entryById, type Anchor } from './script';
import { Caption, SmallPrint } from './components/Caption';
import { Callout } from './components/Callout';
import { ClipOrSimulated, SimulatedLabel, useHasClip } from './components/ClipOrSimulated';
import { Cursor, cursorAt } from './components/Cursor';
import { Zoom } from './components/Zoom';
import { PanelMock, panelLayout, type Key } from './components/PanelMock';
import { BrowserFrame, ContextMenu, DownloadChip, DragGhost, DownloadChip as _D, EmailApp, FileApp, PANEL_X, CHROME_H } from './components/Screens';

void _D;

// Zoom on the side panel: panel-local (0,0) lands at DEST, everything is scaled by ZOOM.
const ZOOM = 1.55;
const FOCUS = { x: PANEL_X, y: CHROME_H };
const DEST = { x: 1209, y: 40 };
const toScreen = (lx: number, ly: number) => ({ x: DEST.x + lx * ZOOM, y: DEST.y + ly * ZOOM });

function resolve(a: Anchor, lay: ReturnType<typeof panelLayout>) {
  if ('x' in a) return a; // absolute screen coordinates (for real clips)
  if (a.part === 'stamp') return toScreen(24, lay.stamp.y0 + 40);
  if (a.part === 'policy') return toScreen(60, lay.policyY);
  const key = a.part.slice(4) as Key;
  return toScreen(10, lay.rows[key].headY);
}

const Cover: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: DEST.x, height: 1080, background: C.background, borderRight: `1px solid ${C.border}`, opacity }} />
);

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: PANEL_X, top: CHROME_H, width: 420, height: 1008 }}>{children}</div>
);

export const GmailScene: React.FC = () => {
  const f = useCurrentFrame();
  const g = script.gmail;
  const entry = entryById(g.entry);
  const hasClip = useHasClip(g.clip);
  const { sim, zoom } = g;
  const variant = f < sim.loadingAt ? 'empty' : f < sim.reportAt ? 'loading' : 'report';
  const lay = panelLayout({ fileLine: false, openKey: 'bias' });
  const menu = window_(f, sim.menuAt, sim.clickAt + 4, 4);
  const screen = (
    <BrowserFrame title="Email app" address="mail.example.org/inbox">
      <EmailApp f={f} openAt={sim.openEmail} selectFrom={sim.selectFrom} selectTo={sim.selectTo} />
      <Panel>
        <PanelMock variant={variant} entry={entry} result={g.result} openKey="bias" t={Math.max(0, f - sim.reportAt)} />
      </Panel>
      {menu > 0 && <ContextMenu left={884} top={504} items={['Copy', 'Search the web', 'Check with TrustLens']} hot={f >= sim.clickAt - 8 ? 'Check with TrustLens' : null} opacity={menu} />}
      <Cursor keys={g.cursor} hideAfter={zoom.from} />
    </BrowserFrame>
  );
  return (
    <>
      <Zoom from={zoom.from} to={zoom.to} scale={ZOOM} focus={FOCUS} dest={DEST}>
        <ClipOrSimulated clip={g.clip}>{screen}</ClipOrSimulated>
      </Zoom>
      <Cover opacity={prog(f, zoom.from + 8, zoom.to)} />
      {g.callouts.map((c) => <Callout key={c.label} cfg={c} target={resolve(c.target, lay)} />)}
      <Caption text={g.caption.text} from={g.caption.from} to={g.caption.to} />
      {!hasClip && <SimulatedLabel />}
    </>
  );
};

export const DriveScene: React.FC = () => {
  const f = useCurrentFrame();
  const d = script.drive;
  const entry = entryById(d.entry);
  const hasClip = useHasClip(d.clip);
  const { sim, zoom } = d;
  const variant = f < sim.loadingAt ? 'empty' : f < sim.reportAt ? 'loading' : 'report';
  const fileLine = `${d.file.name} · ${d.file.size} · Read ${d.file.chars} characters`;
  const lay = panelLayout({ fileLine: true, openKey: 'accuracy' });
  const menu = window_(f, sim.menuAt, sim.downloadAt + 4, 4);
  const dragging = f >= sim.dragFrom && f < sim.dropAt;
  const cur = cursorAt(d.cursor, f);
  const screen = (
    <BrowserFrame title="File storage" address="files.example.org/shared/rimpa-demo">
      <FileApp selected={f >= sim.menuAt} />
      <DownloadChip name={d.file.name} size={d.file.size} p={prog(f, sim.downloadAt + 2, sim.downloadAt + 10)} />
      <Panel>
        <PanelMock variant={variant} entry={entry} result={d.result} openKey="accuracy" t={Math.max(0, f - sim.reportAt)} fileLine={fileLine} fromLabel="Quoted from the file" dropHot={dragging && f > sim.dragFrom + 18} />
      </Panel>
      {menu > 0 && <ContextMenu left={574} top={504} items={['Open', 'Download', 'Share']} hot={f >= sim.downloadAt - 8 ? 'Download' : null} opacity={menu} />}
      {dragging && <DragGhost x={cur.x} y={cur.y} name={d.file.name} opacity={1} />}
      <Cursor keys={d.cursor} hideAfter={zoom.from} />
    </BrowserFrame>
  );
  return (
    <>
      <Zoom from={zoom.from} to={zoom.to} scale={ZOOM} focus={FOCUS} dest={DEST}>
        <ClipOrSimulated clip={d.clip}>{screen}</ClipOrSimulated>
      </Zoom>
      <Cover opacity={prog(f, zoom.from + 8, zoom.to)} />
      {d.callouts.map((c) => <Callout key={c.label} cfg={c} target={resolve(c.target, lay)} />)}
      <Caption text={d.caption.text} from={d.caption.from} to={d.caption.to} bottom={206} />
      <SmallPrint text={d.small.text} from={d.small.from} to={d.small.to} bottom={138} />
      {!hasClip && <SimulatedLabel />}
    </>
  );
};

export const PolicyScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = script.policy;
  const entry = entryById(p.entry);
  const d = script.drive;
  const fileLine = `${d.file.name} · ${d.file.size} · Read ${d.file.chars} characters`;
  return (
    <>
      <Zoom from={-1} to={0} scale={ZOOM} focus={FOCUS} dest={DEST}>
        <BrowserFrame title="File storage" address="files.example.org/shared/rimpa-demo">
          <FileApp selected />
          <Panel>
            <PanelMock variant="report" entry={entry} result={d.result} openKey="accuracy" t={100} fileLine={fileLine} fromLabel="Quoted from the file"
              sheet={{ p: prog(f, p.sheetAt, p.sheetAt + 12), policyId: p.policyId }} />
          </Panel>
        </BrowserFrame>
      </Zoom>
      <Cover opacity={1} />
      <Cursor keys={p.cursor} />
      <Caption text={p.caption.text} from={p.caption.from} to={p.caption.to} />
      <SmallPrint text={p.small.text} from={p.small.from} to={p.small.to} bottom={50} />
      <SimulatedLabel />
    </>
  );
};

const centre: React.CSSProperties = { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: FONT, color: C.foreground };

export const HookScene: React.FC = () => {
  const f = useCurrentFrame();
  const [first, second] = script.hook.lines;
  const o1 = prog(f, first.from, first.from + 10);
  const o2 = prog(f, second.from, second.from + 10);
  return (
    <>
      <div style={{ ...centre, top: 330, fontSize: 124, fontWeight: 700, opacity: o1, transform: `translateY(${(1 - o1) * 14}px)`, color: o2 > 0.5 ? C.muted : C.foreground }}>{first.text}</div>
      <div style={{ ...centre, top: 520, fontSize: 124, fontWeight: 700, opacity: o2, transform: `translateY(${(1 - o2) * 14}px)`, color: C.accent }}>{second.text}</div>
    </>
  );
};

export const ProductScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = prog(f, 4, 16);
  const b = prog(f, 22, 34);
  return (
    <>
      <div style={{ ...centre, top: 230, opacity: a }}><Img src={staticFile('logo-mark.png')} style={{ width: 180, height: 180 }} /></div>
      <div style={{ ...centre, top: 440, fontSize: 150, fontWeight: 700, opacity: a, transform: `translateY(${(1 - a) * 12}px)` }}>
        {script.product.wordmark.replace(' Lite', '')} <span style={{ fontWeight: 400, color: C.muted }}>Lite</span>
      </div>
      <div style={{ ...centre, top: 650, fontSize: 56, fontWeight: 600, opacity: b, transform: `translateY(${(1 - b) * 12}px)` }}>{script.product.line}</div>
    </>
  );
};

export const CloseScene: React.FC = () => {
  const f = useCurrentFrame();
  const c = script.close;
  const a = prog(f, 4, 16);
  const b = prog(f, c.creditFrom, c.creditFrom + 12);
  return (
    <>
      <div style={{ ...centre, top: 330, padding: '0 200px', fontSize: 96, fontWeight: 700, lineHeight: 1.12, opacity: a, transform: `translateY(${(1 - a) * 12}px)` }}>{c.line.replace('know-how', 'know\u2011how')}</div>
      <div style={{ ...centre, top: 650, fontSize: 56, fontWeight: 600, color: C.accent, opacity: b }}>{c.credit}</div>
      <div style={{ ...centre, bottom: 56, fontSize: 30, fontWeight: 600, color: C.muted, opacity: b }}>{c.small}</div>
    </>
  );
};
