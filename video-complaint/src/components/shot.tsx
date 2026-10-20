// The email screenshot as a camera. Everything on it (zoom, pan, highlights, cursor) is placed in screenshot pixels
// (1694 x 928) and moved by the keyframes in src/data/camera.json.
import React, { createContext, useContext } from 'react';
import { Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { prog, hasClip } from '../lib';
import camera from '../data/camera.json';
import highlights from '../data/highlights.json';
import timeline from '../data/timeline60.json';
import clips from '../data/clips60.json';

export const SHOT = highlights.screenshot; // { width: 1694, height: 928 }
export const BASE = Math.max(1920 / SHOT.width, 1080 / SHOT.height); // "cover" on the 1920 x 1080 canvas
export const MAX_ZOOM = 2.8;

// ---------- the global frame (scenes are Sequences, the keyframes use the whole 0-1799 timeline) ----------
const FromCtx = createContext(0);
export const SceneFrom = FromCtx.Provider;
export const useG = () => useCurrentFrame() + useContext(FromCtx);
export const CaptionsOn = createContext(true);

// ---------- keyframes: ease-in-out between neighbours, no overshoot ----------
type Key = { frame: number; cx: number; cy: number; scale: number };
const inOut = Easing.inOut(Easing.cubic);
export function cameraAt(g: number, keys: Key[] = camera.keys) {
  if (g <= keys[0].frame) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (g <= b.frame) {
      const t = inOut(Math.min(1, Math.max(0, (g - a.frame) / Math.max(1, b.frame - a.frame))));
      return { frame: g, cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, scale: a.scale + (b.scale - a.scale) * t };
    }
  }
  return keys[keys.length - 1];
}

// ---------- where the panel is: closed, sliding in, docked ----------
const [OPEN_A, OPEN_B] = timeline.panel.open;
export const PANEL_W = Math.round(timeline.panel.width * timeline.panel.scale); // 924
export const panelOpen = (g: number) => prog(g, OPEN_A, OPEN_B);
export const viewportW = (g: number) => 1920 - PANEL_W * panelOpen(g);

export type Cam = { s: number; ox: number; oy: number; vw: number; k: number; toCanvas: (x: number, y: number) => { x: number; y: number } };
const CamCtx = createContext<Cam | null>(null);
export const useCam = () => useContext(CamCtx)!;

export function useShotCam(): Cam {
  const g = useG();
  const c = cameraAt(g);
  const k = Math.min(MAX_ZOOM, c.scale);
  const s = BASE * k;
  const vw = viewportW(g), vh = 1080;
  const fit = (center: number, view: number, size: number) => {
    const want = view / 2 - center * s;
    if (size * s <= view) return (view - size * s) / 2; // smaller than the view: centre it
    return Math.min(0, Math.max(view - size * s, want)); // never show beyond the picture
  };
  const ox = fit(c.cx, vw, SHOT.width), oy = fit(c.cy, vh, SHOT.height);
  return { s, ox, oy, vw, k, toCanvas: (x, y) => ({ x: ox + x * s, y: oy + y * s }) };
}

// The clip for this scene, when one exists in public/clips/
export const sceneClip = (id: string) => { const sc = timeline.scenes.find((x) => x.id === id)!; return hasClip(sc.clip) ? sc.clip : null; };

export const CamProvider = CamCtx.Provider;
export const ShotLayer: React.FC<{ clip?: string | null; children?: React.ReactNode }> = ({ clip, children }) => {
  const cam = useCam();
  const cfg = clip ? (clips as any)[clip] : null;
  const scene = timeline.scenes.find((x) => x.clip === clip);
  const rate = cfg?.seconds && scene ? (cfg.seconds * timeline.fps) / (scene.to - scene.from + 1) : 1;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: cam.vw, height: 1080, overflow: 'hidden', background: '#FFFFFF' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: SHOT.width, height: SHOT.height, transformOrigin: '0 0', transform: `translate(${cam.ox}px, ${cam.oy}px) scale(${cam.s})` }}>
          {clip
            ? <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} startFrom={cfg.startFrom} playbackRate={rate} muted style={{ width: SHOT.width, height: SHOT.height, objectFit: 'cover' }} />
            : <Img src={staticFile('screens/gmail-complaint.png')} style={{ width: SHOT.width, height: SHOT.height, display: 'block' }} />}
          {!clip && children}
        </div>
      </div>
    </>
  );
};

// ---------- highlights: a soft yellow fill drawn left to right in 12 frames, then a thin accent underline ----------
export const BOXES = highlights.boxes as Record<string, { box: number[]; text: string }>;
export const Highlight: React.FC<{ id: string; from: number; to?: number }> = ({ id, from, to }) => {
  const g = useG(); const cam = useCam();
  if (g < from || (to !== undefined && g > to)) return null;
  const [x1, y1, x2, y2] = BOXES[id].box;
  const draw = interpolate(g, [from, from + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const fade = to === undefined ? 1 : 1 - prog(g, to - 8, to);
  const line = 2.5 / cam.s;
  return (
    <div style={{ position: 'absolute', left: x1 - 2, top: y1 - 1, width: x2 - x1 + 4, height: y2 - y1 + 2, opacity: fade, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, width: `${draw * 100}%`, background: 'rgba(255, 214, 0, 0.35)' }} />
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: line, width: `${draw * 100}%`, background: C.accent, opacity: prog(g, from + 10, from + 18) }} />
    </div>
  );
};

// A thin outline, for the attachment under the cursor
export const Outline: React.FC<{ id: string; from: number; to: number }> = ({ id, from, to }) => {
  const g = useG(); const cam = useCam();
  const o = Math.min(prog(g, from, from + 8), 1 - prog(g, to - 8, to));
  if (o <= 0) return null;
  const [x1, y1, x2, y2] = BOXES[id].box;
  return <div style={{ position: 'absolute', left: x1 - 3, top: y1 - 3, width: x2 - x1 + 6, height: y2 - y1 + 6, border: `${3 / cam.s}px solid ${C.accent}`, borderRadius: 4 / cam.s, opacity: o }} />;
};

// ---------- a cursor that lives in screenshot coordinates and keeps its size on screen ----------
export type ShotKey = { f: number; x: number; y: number; press?: boolean };
export const ShotCursor: React.FC<{ keys: ShotKey[]; visible?: number }> = ({ keys, visible = 1 }) => {
  const g = useG(); const cam = useCam();
  const o = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) } as const;
  const fs = keys.map((k) => k.f);
  const x = interpolate(g, fs, keys.map((k) => k.x), o), y = interpolate(g, fs, keys.map((k) => k.y), o);
  const down = keys.some((k) => k.press && g >= k.f && g < k.f + 6);
  const p = cam.toCanvas(x, y);
  if (visible <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: p.x, top: p.y, opacity: visible, pointerEvents: 'none', zIndex: 20 }}>
      {keys.filter((k) => k.press).map((k) => { const t = (g - k.f) / 14; return t < 0 || t > 1 ? null : <div key={k.f} style={{ position: 'absolute', left: -28 * t, top: -28 * t, width: 56 * t, height: 56 * t, borderRadius: '50%', border: `3px solid ${C.accent}`, opacity: 1 - t }} />; })}
      <svg width="40" height="46" viewBox="0 0 34 40" style={{ position: 'absolute', left: -4, top: -3, transform: `scale(${down ? 0.88 : 1})`, transformOrigin: '4px 3px' }}>
        <path d="M4 3 L4 31 L11 25 L16 36 L21 34 L16 23 L26 23 Z" fill={C.foreground} stroke="#FFFFFF" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
};
