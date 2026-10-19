import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { prog, window_ } from '../lib';

// Burned-in caption: max 8 words, 52px, high contrast, bottom-left so it never covers the panel (which sits right).
export const Caption: React.FC<{ text: string; from: number; to: number; bottom?: number }> = ({ text, from, to, bottom = 118 }) => {
  const f = useCurrentFrame();
  if (text.trim().split(/\s+/).length > 8) throw new Error(`Caption longer than 8 words: ${text}`);
  const o = window_(f, from, to, 8);
  return (
    <div style={{ position: 'absolute', left: 72, bottom, maxWidth: 1040, padding: '14px 26px', background: C.background, border: `2px solid ${C.foreground}`, borderRadius: 4,
      fontFamily: FONT, fontSize: 52, fontWeight: 700, lineHeight: 1.15, color: C.foreground, opacity: o, transform: `translateY(${(1 - prog(f, from, from + 8)) * 10}px)` }}>
      {text}
    </div>
  );
};

export const SmallPrint: React.FC<{ text: string; from: number; to: number; bottom?: number }> = ({ text, from, to, bottom = 52 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 72, bottom, maxWidth: 1040, fontFamily: FONT, fontSize: 32, fontWeight: 600, color: C.foreground, opacity: window_(f, from, to, 8) }}>
      {text}
    </div>
  );
};
