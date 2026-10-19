import { useEffect, useState } from 'react';
import { Easing, continueRender, delayRender, interpolate, staticFile } from 'remotion';

export const ease = Easing.out(Easing.cubic);

// 0..1 over [from, to] with gentle ease-out. No overshoot anywhere.
export const prog = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

// Visible between from and to, with short fades at both ends.
export const window_ = (frame: number, from: number, to: number, fade = 6) =>
  Math.min(prog(frame, from, from + fade), 1 - prog(frame, to - fade, to));

// ---- local fonts (no CDN): loaded with the FontFace API from public/fonts
let fontsPromise: Promise<void> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all(
    [
      ['normal', '400', 'source-sans-3-400-normal.woff2'],
      ['normal', '600', 'source-sans-3-600-normal.woff2'],
      ['normal', '700', 'source-sans-3-700-normal.woff2'],
      ['italic', '400', 'source-sans-3-400-italic.woff2'],
    ].map(async ([style, weight, file]) => {
      const face = new FontFace('Source Sans 3', `url(${staticFile('fonts/' + file)}) format("woff2")`, { style, weight });
      (document.fonts as any).add(await face.load());
    }),
  ).then(() => undefined);
  return fontsPromise;
}
export function useLocalFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => { loadFonts().finally(() => continueRender(handle)); }, [handle]);
}

// ---- does a file exist in public/?  src/present.json is written by remotion.config.ts when Studio or a render starts.
import present from './present.json';
export function useFileExists(path: string): boolean {
  return (present.files as string[]).includes(path);
}
