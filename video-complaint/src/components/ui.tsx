import React from 'react';
import { Img, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C, FONT } from '../theme';
import { ease, hasClip, prog, win } from '../lib';
import timeline from '../timeline.json';
import clips from '../clips.json';

// ---------- scene shell: 8 frame fade in (ease-out), then holds ----------
export const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', inset: 0, background: C.background, opacity: prog(f, 0, 8), overflow: 'hidden', fontFamily: FONT, color: C.foreground }}>{children}</div>;
};

// ---------- captions: one at a time, 48 px, max 8 words, bottom left ----------
export const Caption: React.FC<{ text: string; from: number; to: number }> = ({ text, from, to }) => {
  const f = useCurrentFrame();
  if (text.trim().split(/\s+/).length > 8) throw new Error(`Caption longer than 8 words: ${text}`);
  const o = win(f, from, to, 8);
  return (
    <div style={{ position: 'absolute', left: 60, bottom: 64, maxWidth: 800, padding: '12px 24px', background: C.background, border: `2px solid ${C.foreground}`, borderRadius: 4, fontSize: timeline.captionPx, fontWeight: 700, lineHeight: 1.15, opacity: o, transform: `translateY(${(1 - prog(f, from, from + 10)) * 10}px)` }}>
      {text}
    </div>
  );
};

export const DemoLabel: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: 'absolute', left: 40, top: 14, padding: '2px 12px', border: `1px solid ${C.border}`, borderRadius: 4, background: C.background, fontSize: 22, zIndex: 6, fontWeight: 600, color: C.muted }}>{text}</div>
);

// ---------- cursor with a small press state ----------
export type CursorKey = { f: number; x: number; y: number; press?: boolean };
export const Cursor: React.FC<{ keys: CursorKey[]; visible?: number }> = ({ keys, visible = 1 }) => {
  const f = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const o = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease } as const;
  const x = interpolate(f, fs, keys.map((k) => k.x), o);
  const y = interpolate(f, fs, keys.map((k) => k.y), o);
  const down = keys.some((k) => k.press && f >= k.f && f < k.f + 6);
  const click = keys.filter((k) => k.press).map((k) => k.f);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: visible, pointerEvents: 'none' }}>
      {click.map((c) => { const t = (f - c) / 12; return t < 0 || t > 1 ? null : <div key={c} style={{ position: 'absolute', left: x - 26 * t, top: y - 26 * t, width: 52 * t, height: 52 * t, borderRadius: '50%', border: `3px solid ${C.accent}`, opacity: 1 - t }} />; })}
      <svg width="40" height="46" viewBox="0 0 34 40" style={{ position: 'absolute', left: x - 4, top: y - 3, transform: `scale(${down ? 0.88 : 1})`, transformOrigin: '4px 3px' }}>
        <path d="M4 3 L4 31 L11 25 L16 36 L21 34 L16 23 L26 23 Z" fill={C.foreground} stroke={C.background} strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

// ---------- a real clip when public/clips/<name>.mp4 exists, otherwise the simulated scene ----------
export const ClipOrSim: React.FC<{ name: string; frames: number; children: React.ReactNode }> = ({ name, frames, children }) => {
  const f = useCurrentFrame();
  if (!hasClip(name)) return <>{children}</>;
  const cfg = (clips as any)[name] ?? { startFrom: 0, seconds: null };
  const rate = cfg.seconds ? (cfg.seconds * timeline.fps) / frames : 1; // sped up or slowed down so the part fills the scene
  const zoom = 1 + 0.04 * prog(f, 0, frames); // a subtle zoom
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      <OffthreadVideo src={staticFile(`clips/${name}.mp4`)} startFrom={cfg.startFrom} playbackRate={rate} muted style={{ width: 1920, height: 1080, objectFit: 'cover', transform: `scale(${zoom})` }} />
    </div>
  );
};

// ---------- the simulated mail window: generic, no brand ----------
export const MailWindow: React.FC<{ facts: any; chipsP?: number; highlight?: number; opacity?: number }> = ({ facts, chipsP = 1, highlight = 0, opacity = 1 }) => {
  const e = facts.email;
  return (
    <div style={{ position: 'absolute', left: 50, top: 50, width: 800, height: 790, background: '#FFFEFB', border: `1px solid ${C.border}`, borderRadius: 10, opacity, overflow: 'hidden' }}>
      <div style={{ height: 52, background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 24px', fontSize: 22, fontWeight: 600, color: C.muted }}>Mail</div>
      <div style={{ padding: '28px 44px' }}>
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.2 }}>{e.subject}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '20px 0 16px' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700, color: C.muted }}>EM</div>
          <div><div style={{ fontSize: 26, fontWeight: 700 }}>{e.sender}</div><div style={{ fontSize: 20, color: C.muted }}>to Complaints team</div></div>
        </div>
        {e.lines.map((l: string, i: number) => <p key={i} style={{ fontSize: 24, lineHeight: 1.45, margin: '0 0 14px' }}>{l}</p>)}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 20, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 20, color: C.muted, fontWeight: 600 }}>{e.attachments.length} attachments</div>
          {e.attachments.map((a: any, i: number) => {
            const p = prog(chipsP * 3, i, i + 1);
            return (
              <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', border: `${highlight ? 2 : 1}px solid ${highlight ? C.accent : C.border}`, borderRadius: 6, background: C.background, opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
                <span style={{ padding: '2px 8px', background: C.foreground, color: C.background, fontSize: 16, fontWeight: 700, borderRadius: 3 }}>PDF</span>
                <span style={{ fontSize: 24, fontWeight: 600 }}>{a.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const Logo: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile('logo-mark.png')} style={{ width: size, height: size }} />;

// ---------- the complaint email, as a screenshot of the test message ----------
// White page behind it so the screenshot's edge does not show. The image is 1651 x 780, drawn at the canvas width.
export const MailBackground: React.FC<{ opacity?: number; zoom?: number }> = ({ opacity = 1, zoom = 1 }) => (
  <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF' }}>
    <Img src={staticFile('mail-background.png')} style={{ position: 'absolute', left: 0, top: 0, width: 1920, opacity, transform: `scale(${zoom})`, transformOrigin: '0 0' }} />
  </div>
);

// ---------- a label with an arrow to the part it names (same style as the product intro video) ----------
export const Callout: React.FC<{ label: string; from: number; to: number; at: { x: number; y: number }; width: number; target: { x: number; y: number } }> = ({ label, from, to, at, width, target }) => {
  const f = useCurrentFrame();
  const o = win(f, from, to, 6);
  if (o <= 0) return null;
  const h = 70, sx = at.x + width, sy = at.y + h / 2;
  const draw = prog(f, from + 2, from + 12);
  const ang = Math.atan2(target.y - sy, target.x - sx);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: o, zIndex: 10 }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <line x1={sx} y1={sy} x2={sx + (target.x - sx) * draw} y2={sy + (target.y - sy) * draw} stroke={C.accent} strokeWidth="5" strokeLinecap="round" />
        {draw > 0.95 && <polygon points="0,0 -24,-11 -24,11" fill={C.accent} transform={`translate(${target.x} ${target.y}) rotate(${(ang * 180) / Math.PI})`} />}
      </svg>
      <div style={{ position: 'absolute', left: at.x, top: at.y, width, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.accent, color: C.accentFg, borderRadius: 4, fontSize: 44, fontWeight: 700 }}>{label}</div>
    </div>
  );
};
