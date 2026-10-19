import { useEffect, useState } from 'react';
import { Easing, continueRender, delayRender, interpolate, staticFile } from 'remotion';
import present from './present.json';

export const ease = Easing.out(Easing.cubic); // ease-out only: no spring, no bounce
export const prog = (f: number, from: number, to: number) =>
  interpolate(f, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// 1 between from and to, with 8 frame fades at each end
export const win = (f: number, from: number, to: number, fade = 8) => Math.min(prog(f, from, from + fade), 1 - prog(f, to - fade, to));

let fontsPromise: Promise<void> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all([['normal', '400', 'source-sans-3-400-normal.woff2'], ['normal', '600', 'source-sans-3-600-normal.woff2'], ['normal', '700', 'source-sans-3-700-normal.woff2'], ['italic', '400', 'source-sans-3-400-italic.woff2']]
    .map(async ([style, weight, file]) => { const face = new FontFace('Source Sans 3', `url(${staticFile('fonts/' + file)}) format("woff2")`, { style, weight }); (document.fonts as any).add(await face.load()); })).then(() => undefined);
  return fontsPromise;
}
export function useLocalFonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => { loadFonts().finally(() => continueRender(handle)); }, [handle]);
}
export const hasClip = (name: string) => (present.files as string[]).includes(`clips/${name}.mp4`);
