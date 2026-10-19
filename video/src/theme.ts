// Tokens copied from trustlens-lite/DESIGN.md (light theme). No gradients, no shadows except the clause sheet.
export const C = {
  background: '#FAF6EE',
  surface: '#F2EBDD',
  foreground: '#1E2321',
  muted: '#4E544E',
  border: '#D6CCB8',
  accent: '#2B4A7A',
  accentFg: '#FAF6EE',
  ok: '#1D6A39', okBg: '#E2EFE2',
  check: '#774C00', checkBg: '#F6E6C0',
  concern: '#A1252A', concernBg: '#F6D9D5',
} as const;

export const FONT = '"Source Sans 3", system-ui, sans-serif';

export type Tone = 'ok' | 'check' | 'concern' | 'accent';
export const toneColors = (t: Tone) =>
  t === 'ok' ? { fg: C.ok, bg: C.okBg } : t === 'check' ? { fg: C.check, bg: C.checkBg } : t === 'concern' ? { fg: C.concern, bg: C.concernBg } : { fg: C.accent, bg: C.surface };
