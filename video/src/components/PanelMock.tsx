import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, FONT, toneColors, type Tone } from '../theme';
import { prog } from '../lib';
import policies from '../data/policies.json';

// A simulated TrustLens panel, built from the tokens in DESIGN.md. Every height is fixed so callouts can point at exact parts.
export const PANEL_W = 420;
export const HEADER_H = 48;
export const FILELINE_H = 30;
export const STAMP_H = 172;
export const HEAD_H = 62;
export const BODY_H = 256;
// The side panel is taller than the zoomed view, so the clause sheet sits at the bottom of the visible part (local y 650).
const SHEET_BOTTOM = 1008 - 650 - 120; // the sheet extends 120px further down so it covers the rows beneath it
export const KEYS = ['bias', 'accuracy', 'deception', 'governance'] as const;
export type Key = (typeof KEYS)[number];
const NAMES: Record<Key, string> = { bias: 'Bias', accuracy: 'Accuracy', deception: 'Deception risk', governance: 'Governance' };

export function panelLayout(opts: { fileLine: boolean; openKey: Key | null }) {
  let y = HEADER_H + (opts.fileLine ? FILELINE_H : 0);
  const stamp = { y0: y, y1: y + STAMP_H };
  y = stamp.y1;
  const rows = {} as Record<Key, { y0: number; headY: number; y1: number }>;
  let policyY = 0;
  for (const k of KEYS) {
    const y0 = y;
    y += HEAD_H;
    const headY = y0 + HEAD_H / 2;
    if (opts.openKey === k) { y += BODY_H; policyY = y - 24; }
    rows[k] = { y0, headY, y1: y };
  }
  return { stamp, rows, policyY, end: y };
}

const Icon: React.FC<{ name: 'check' | 'warn' | 'stop' | 'pencil' | 'more' | 'chev'; size?: number; color?: string }> = ({ name, size = 18, color = 'currentColor' }) => {
  const d = {
    check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
    warn: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
    stop: <><path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" /><path d="M12 8v5M12 16v.5" /></>,
    pencil: <><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></>,
    more: <><circle cx="5.5" cy="12" r="1.2" fill={color} /><circle cx="12" cy="12" r="1.2" fill={color} /><circle cx="18.5" cy="12" r="1.2" fill={color} /></>,
    chev: <path d="M6 9l6 6 6-6" />,
  }[name];
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
};

const STATUS: Record<string, { tone: Tone; icon: 'check' | 'warn' | 'stop' }> = { OK: { tone: 'ok', icon: 'check' }, Check: { tone: 'check', icon: 'warn' }, Concern: { tone: 'concern', icon: 'stop' } };

const Badge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS[status];
  const t = toneColors(s.tone);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 8px', border: `1px solid ${t.fg}`, borderRadius: 4, background: t.bg, color: t.fg, fontSize: 12, fontWeight: 600 }}><Icon name={s.icon} size={14} />{status}</span>;
};

export type PanelProps = {
  variant: 'empty' | 'loading' | 'report';
  entry: any;
  result: { label: string; tone: Tone };
  openKey: Key | null;
  t: number;                  // frames since the report appeared (drives the stamp-then-rows entrance)
  fileLine?: string;          // "name · size · Read N characters" for files
  fromLabel?: string;         // 'From the email' or 'Quoted from the file'
  dropHot?: boolean;
  sheet?: { p: number; policyId: string };
};

const Header: React.FC = () => (
  <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
    <Img src={staticFile('logo-mark.png')} style={{ width: 24, height: 24 }} />
    <span style={{ fontSize: 14, fontWeight: 700, marginRight: 'auto' }}>TrustLens <span style={{ fontWeight: 400, color: C.muted }}>Lite</span></span>
    <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, border: `1px dashed ${C.accent}`, borderRadius: 4, padding: '0 8px' }}>Demo mode</span>
  </div>
);

export const PanelMock: React.FC<PanelProps> = (p) => {
  const lay = panelLayout({ fileLine: !!p.fileLine, openKey: p.openKey });
  const r = p.entry.report;
  const tone = toneColors(p.result.tone);
  const stampIn = prog(p.t, 0, 8);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: PANEL_W, height: 1008, background: C.background, color: C.foreground, fontFamily: FONT, fontSize: 14, lineHeight: 1.45, overflow: 'hidden', borderLeft: `1px solid ${C.border}`, boxSizing: 'border-box' }}>
      <Header />
      {p.variant === 'empty' && (
        <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Img src={staticFile('logo.png')} style={{ width: 144, height: 'auto', marginBottom: 8 }} />
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>Nothing checked yet</div>
          <div>Select text on any page, right-click, and choose “Check with TrustLens”.</div>
          <div style={{ marginTop: 8, padding: 16, border: `1px ${p.dropHot ? 'solid' : 'dashed'} ${p.dropHot ? C.accent : C.muted}`, borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>Or drop a file here: PDF, Word (.docx), text or Markdown.</div>
            <span style={{ alignSelf: 'flex-start', border: `1px solid ${C.muted}`, borderRadius: 4, padding: '7px 16px', fontWeight: 600 }}>Choose file</span>
            <div style={{ fontSize: 12, color: C.muted }}>Up to 5 MB. The file is read in your browser. Only masked text is sent for checking.</div>
          </div>
        </div>
      )}
      {p.variant === 'loading' && (
        <div>
          <div style={{ padding: 16, fontWeight: 600 }}>Checking. This usually takes under 10 seconds.</div>
          <div style={{ height: 128, background: C.surface, borderTop: `4px solid ${C.border}` }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ padding: 16, borderTop: `1px solid ${C.border}`, display: 'grid', gap: 8 }}>
              <div style={{ height: 14, width: '40%', background: C.surface, borderRadius: 4 }} />
              <div style={{ height: 14, background: C.surface, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}
      {p.variant === 'report' && (
        <>
          {p.fileLine && <div style={{ height: FILELINE_H, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}`, boxSizing: 'border-box', opacity: stampIn }}>{p.fileLine}</div>}
          <div style={{ height: STAMP_H, boxSizing: 'border-box', padding: 16, background: tone.bg, borderTop: `4px solid ${tone.fg}`, borderBottom: `1px solid ${C.border}`, opacity: stampIn, transform: `translateY(${(1 - stampIn) * 6}px)` }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ color: tone.fg, marginTop: 1 }}><Icon name={p.result.tone === 'concern' ? 'stop' : 'pencil'} size={28} /></div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{p.result.label}</div>
            </div>
            <div style={{ margin: '4px 0 16px', minHeight: 40 }}>{r.stamp_reason}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: C.accent, color: C.accentFg, borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Follow advice</span>
              <span style={{ border: `1px solid ${C.muted}`, borderRadius: 4, padding: '7px 16px', fontWeight: 600 }}>Override</span>
              <span style={{ marginLeft: 'auto', border: `1px solid ${C.muted}`, borderRadius: 4, width: 36, height: 36, display: 'grid', placeItems: 'center' }}><Icon name="more" size={20} /></span>
            </div>
          </div>
          {KEYS.map((k, i) => {
            const c = r[k];
            const rowIn = prog(p.t, 6 + i * 3, 12 + i * 3);
            const open = p.openKey === k;
            const ev: string[] = c.evidence;
            const cite = policies.policies.find((x: any) => x.id === c.basis[0]);
            return (
              <div key={k} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, opacity: rowIn, transform: `translateY(${(1 - rowIn) * 6}px)` }}>
                <div style={{ height: HEAD_H, boxSizing: 'border-box', padding: '8px 16px', display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 8, alignContent: 'center', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>{NAMES[k]}</span>
                  <Badge status={c.status} />
                  <span style={{ transform: open ? 'rotate(180deg)' : 'none', display: 'grid' }}><Icon name="chev" /></span>
                  <span style={{ gridColumn: '1 / -1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.headline}</span>
                </div>
                {open && (
                  <div style={{ height: BODY_H, boxSizing: 'border-box', padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
                    <div>{c.summary}</div>
                    {ev[0] && (
                      <div>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{p.fromLabel ?? 'From the email'}</div>
                        <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.muted}`, fontStyle: 'italic' }}>{ev[0]}</div>
                        {ev.length > 1 && <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, textDecoration: 'underline', marginTop: 4 }}>+{ev.length - 1} more</div>}
                      </div>
                    )}
                    <div><b>Next step: </b>{c.next_step}</div>
                    {cite && <div style={{ marginTop: 'auto', color: C.accent, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>{cite.document} s{cite.section}</div>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '24px 16px', fontSize: 12, color: C.muted }}>
            <div>Signals, not proof. A person makes the final call.</div>
            <div>Policy basis: RIMPA Global published governance documents</div>
          </div>
        </>
      )}
      {p.sheet && p.sheet.p > 0 && <Sheet p={p.sheet.p} policyId={p.sheet.policyId} />}
    </div>
  );
};

const Sheet: React.FC<{ p: number; policyId: string }> = ({ p, policyId }) => {
  const pol: any = policies.policies.find((x: any) => x.id === policyId);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: SHEET_BOTTOM, padding: '16px 16px 136px', background: C.background, borderTop: `1px solid ${C.muted}`, borderRadius: '4px 4px 0 0', boxShadow: '0 -8px 24px rgba(30,35,33,0.18)', opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Policy clause</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 4 }}>RIMPA Global {pol.document} v{pol.version}, s{pol.section}</div>
      <div style={{ paddingLeft: 16, borderLeft: `2px solid ${C.muted}`, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pol.quote}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <span style={{ border: `1px solid ${C.muted}`, borderRadius: 4, padding: '7px 16px', fontWeight: 600 }}>Read full clause</span>
        <span style={{ background: C.accent, color: C.accentFg, borderRadius: 4, padding: '8px 16px', fontWeight: 600 }}>Close</span>
      </div>
    </div>
  );
};
