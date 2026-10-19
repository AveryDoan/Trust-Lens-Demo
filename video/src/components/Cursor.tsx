import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { ease } from '../lib';
import type { CursorKey } from '../script';

export function cursorAt(keys: CursorKey[], f: number) {
  const fs = keys.map((k) => k.f);
  const opts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease } as const;
  return { x: interpolate(f, fs, keys.map((k) => k.x), opts), y: interpolate(f, fs, keys.map((k) => k.y), opts) };
}

// Animated pointer, used only on simulated screens. Position and click rings are driven by the frame number.
export const Cursor: React.FC<{ keys: CursorKey[]; hideAfter?: number }> = ({ keys, hideAfter }) => {
  const f = useCurrentFrame();
  const { x, y } = cursorAt(keys, f);
  const clicks = keys.filter((k) => k.click).map((k) => k.f);
  return (
    <>
      {clicks.map((c) => {
        const t = (f - c) / 12;
        if (t < 0 || t > 1) return null;
        return <div key={c} style={{ position: 'absolute', left: x - 30 * t - 6, top: y - 30 * t - 6, width: 60 * t + 12, height: 60 * t + 12, borderRadius: '50%', border: `3px solid ${C.accent}`, opacity: 1 - t }} />;
      })}
      {(hideAfter === undefined || f < hideAfter) && (
        <svg width="34" height="40" viewBox="0 0 34 40" style={{ position: 'absolute', left: x - 4, top: y - 3 }}>
          <path d="M4 3 L4 31 L11 25 L16 36 L21 34 L16 23 L26 23 Z" fill={C.foreground} stroke={C.background} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
};
