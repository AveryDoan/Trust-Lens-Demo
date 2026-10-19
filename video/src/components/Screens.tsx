import React from 'react';
import { C, FONT } from '../theme';
import { prog } from '../lib';
import { emailA, files, inbox } from '../data/emails';

export const PANEL_X = 1500;
export const CHROME_H = 72;

// A browser window (generic: no brand names or logos). The app sits left, the TrustLens side panel on the right.
export const BrowserFrame: React.FC<{ title: string; address: string; children: React.ReactNode }> = ({ title, address, children }) => (
  <div style={{ position: 'absolute', inset: 0, background: C.background, fontFamily: FONT, color: C.foreground }}>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: CHROME_H, background: C.surface, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ position: 'absolute', left: 256, top: 14, height: 46, padding: '0 22px', display: 'flex', alignItems: 'center', background: C.background, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 24, fontWeight: 600 }}>{title}</div>
      <div style={{ position: 'absolute', left: 520, top: 16, width: 900, height: 40, borderRadius: 20, background: C.background, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 22px', fontSize: 22, color: C.muted }}>{address}</div>
    </div>
    {children}
  </div>
);

const row = (top: number): React.CSSProperties => ({ position: 'absolute', left: 0, width: PANEL_X, top, height: 84, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 24, padding: '0 48px', boxSizing: 'border-box', fontSize: 26 });

export const EmailApp: React.FC<{ f: number; openAt: number; selectFrom: number; selectTo: number }> = ({ f, openAt, selectFrom, selectTo }) => {
  const open = prog(f, openAt, openAt + 6);
  const sel = prog(f, selectFrom, selectTo);
  const para = (i: number, extra?: React.CSSProperties) => <div key={i} style={{ position: 'absolute', left: 240, width: 1000, fontSize: 26, lineHeight: '39px', ...extra }}>{emailA.paragraphs[i]}</div>;
  return (
    <div style={{ position: 'absolute', left: 0, top: CHROME_H, width: PANEL_X, height: 1008 }}>
      <div style={{ position: 'absolute', left: 48, top: 40, fontSize: 30, fontWeight: 700 }}>Email app</div>
      {/* inbox */}
      <div style={{ opacity: 1 - open }}>
        <div style={{ position: 'absolute', left: 48, top: 96, fontSize: 24, fontWeight: 600, color: C.muted }}>Inbox</div>
        {inbox.map((m, i) => (
          <div key={m.tag} style={row(160 + i * 84)}>
            <span style={{ padding: '2px 12px', border: `1px solid ${C.accent}`, color: C.accent, borderRadius: 4, fontSize: 22, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.tag}</span>
            <span style={{ fontWeight: 700, width: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.subject}</span>
            <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{m.preview}</span>
          </div>
        ))}
      </div>
      {/* open message: paragraph two is selected (a stacked copy with the highlight fades in) */}
      <div style={{ opacity: open }}>
        <div style={{ position: 'absolute', left: 240, top: 84, fontSize: 38, fontWeight: 700 }}>{emailA.subject}</div>
        <div style={{ position: 'absolute', left: 240, top: 150, fontSize: 24, color: C.muted }}>From: {emailA.from}</div>
        {para(0, { top: 308 })}
        {para(1, { top: 368 })}
        <div style={{ position: 'absolute', left: 240, top: 368, width: 1000, fontSize: 26, lineHeight: '39px', background: '#BDD0F2', opacity: sel }}>{emailA.paragraphs[1]}</div>
        {para(2, { top: 508 })}
        {para(3, { top: 608 })}
      </div>
    </div>
  );
};

export const ContextMenu: React.FC<{ left: number; top: number; items: string[]; hot: string | null; opacity: number }> = ({ left, top, items, hot, opacity }) => (
  <div style={{ position: 'absolute', left, top, width: 320, padding: 6, background: C.background, border: `1px solid ${C.muted}`, borderRadius: 6, opacity, fontFamily: FONT, fontSize: 24, boxSizing: 'border-box' }}>
    {items.map((it) => (
      <div key={it} style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderRadius: 4, background: hot === it ? C.accent : 'transparent', color: hot === it ? C.accentFg : C.foreground, fontWeight: hot === it ? 700 : 400 }}>{it}</div>
    ))}
  </div>
);

export const FileApp: React.FC<{ selected: boolean }> = ({ selected }) => (
  <div style={{ position: 'absolute', left: 0, top: CHROME_H, width: PANEL_X, height: 1008 }}>
    <div style={{ position: 'absolute', left: 48, top: 40, fontSize: 30, fontWeight: 700 }}>File storage</div>
    <div style={{ position: 'absolute', left: 48, top: 96, fontSize: 24, fontWeight: 600, color: C.muted }}>Shared folder / RIMPA demo files</div>
    {files.map((name, i) => (
      <div key={name} style={{ ...row(128 + i * 64), height: 64, background: selected && i === 3 ? C.surface : 'transparent' }}>
        <span style={{ width: 28, height: 34, border: `2px solid ${C.muted}`, borderRadius: 3, display: 'inline-block' }} />
        <span style={{ fontWeight: 600, width: 560 }}>{name}</span>
        <span style={{ color: C.muted }}>PDF document</span>
      </div>
    ))}
  </div>
);

export const DownloadChip: React.FC<{ name: string; size: string; p: number }> = ({ name, size, p }) => (
  <div style={{ position: 'absolute', left: 0, top: 1080 - 84, width: PANEL_X, height: 84, background: C.surface, borderTop: `1px solid ${C.border}`, opacity: p, fontFamily: FONT }}>
    <div style={{ position: 'absolute', left: 24, top: 12, width: 420, height: 60, display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', boxSizing: 'border-box', background: C.background, border: `1px solid ${C.muted}`, borderRadius: 6, fontSize: 24 }}>
      <span style={{ width: 22, height: 28, border: `2px solid ${C.muted}`, borderRadius: 3 }} />
      <b>{name}</b><span style={{ color: C.muted, fontSize: 20 }}>{size}</span>
    </div>
  </div>
);

export const DragGhost: React.FC<{ x: number; y: number; name: string; opacity: number }> = ({ x, y, name, opacity }) => (
  <div style={{ position: 'absolute', left: x + 14, top: y + 18, padding: '8px 16px', background: C.background, border: `2px solid ${C.accent}`, borderRadius: 6, fontFamily: FONT, fontSize: 22, fontWeight: 600, opacity }}>{name}</div>
);
