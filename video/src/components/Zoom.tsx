import React from 'react';
import { useCurrentFrame } from 'remotion';
import { prog } from '../lib';

// Animated crop: the focus point of the screen moves to `dest` while the content scales up to `scale`.
export const zoomState = (f: number, from: number, to: number, scale: number, focus: { x: number; y: number }, dest: { x: number; y: number }) => {
  const p = prog(f, from, to);
  const s = 1 + (scale - 1) * p;
  return { p, s, tx: p * (dest.x - focus.x * scale), ty: p * (dest.y - focus.y * scale) };
};

export const Zoom: React.FC<{ from: number; to: number; scale: number; focus: { x: number; y: number }; dest: { x: number; y: number }; children: React.ReactNode }> = ({ from, to, scale, focus, dest, children }) => {
  const f = useCurrentFrame();
  const z = zoomState(f, from, to, scale, focus, dest);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${z.tx}px, ${z.ty}px) scale(${z.s})` }}>{children}</div>
    </div>
  );
};
