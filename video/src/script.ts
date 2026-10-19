// All copy and timings for the intro live here. Frames are at 30 fps. Scene frames are relative to the scene start.
import demo from './data/demo-results.json';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const TOTAL_FRAMES = 840;
const sec = (s: number) => Math.round(s * FPS);

export type BlurRegion = { x: number; y: number; w: number; h: number; from: number; to: number };
export type ClipConfig = {
  file: string;          // path inside public/
  startFrom: number;     // frames to skip at the start of the recording
  playbackRate: number;  // 1 = real time; up to 1.5 to speed up a slow recording
  blurRegions: BlurRegion[]; // areas to hide (frames relative to the scene start)
};
// An anchor is either a named part of the simulated panel, or absolute screen coordinates (for real clips).
export type Anchor = { part: 'stamp' | 'row:bias' | 'row:accuracy' | 'row:deception' | 'row:governance' | 'policy' } | { x: number; y: number };
export type CalloutCfg = { label: string; from: number; to: number; target: Anchor; labelAt: { x: number; y: number }; width: number };
export type CursorKey = { f: number; x: number; y: number; click?: boolean };

export const entries = demo as any[];
export const entryById = (id: string) => entries.find((e) => e.id === id)!;

export const script = {
  scenes: {
    hook:    { from: sec(0),  frames: sec(3) },
    product: { from: sec(3),  frames: sec(3) },
    gmail:   { from: sec(6),  frames: sec(7) },
    drive:   { from: sec(13), frames: sec(7) },
    policy:  { from: sec(20), frames: sec(5) },
    close:   { from: sec(25), frames: sec(3) },
  },

  hook: {
    lines: [
      { text: 'AI writes it in seconds.', from: 6, to: 52 },
      { text: 'Who checks it?', from: 56, to: 90 },
    ],
  },

  product: {
    wordmark: 'TrustLens Lite',
    line: 'Checks before you share. Inside Gmail. On any file.',
  },

  gmail: {
    clip: { file: 'clips/gmail.mp4', startFrom: 0, playbackRate: 1, blurRegions: [] } as ClipConfig,
    caption: { text: 'Reads the email you are viewing.', from: 14, to: 204 },
    entry: 'A',
    result: { label: 'Do not distribute until reviewed', tone: 'concern' as const },
    // simulated timeline (frames relative to the scene)
    sim: {
      openEmail: 20,       // email A opens from the inbox
      selectFrom: 34, selectTo: 50,  // paragraph gets selected
      menuAt: 56,          // right-click menu appears
      clickAt: 76,         // 'Check with TrustLens' clicked
      loadingAt: 78,       // panel shows its loading state
      reportAt: 94,        // report appears: stamp first, then rows
    },
    zoom: { from: 98, to: 122 },
    cursor: [
      { f: 0, x: 980, y: 520 }, { f: 16, x: 640, y: 262 }, { f: 20, x: 640, y: 262, click: true },
      { f: 34, x: 252, y: 492 }, { f: 50, x: 1020, y: 492 }, { f: 54, x: 880, y: 500 }, { f: 56, x: 880, y: 500, click: true },
      { f: 72, x: 1000, y: 620 }, { f: 76, x: 1000, y: 620, click: true }, { f: 90, x: 1300, y: 760 },
    ] as CursorKey[],
    callouts: [
      { label: 'Bias',     from: 126, to: 152, target: { part: 'row:bias' },     labelAt: { x: 640, y: 360 }, width: 150 },
      { label: 'Accuracy', from: 146, to: 172, target: { part: 'row:accuracy' }, labelAt: { x: 560, y: 740 }, width: 250 },
      { label: 'Policy',   from: 166, to: 192, target: { part: 'policy' },       labelAt: { x: 600, y: 590 }, width: 190 },
      { label: 'Escalate', from: 182, to: 206, target: { part: 'stamp' },        labelAt: { x: 560, y: 150 }, width: 230 },
    ] as CalloutCfg[],
  },

  drive: {
    clip: { file: 'clips/drive.mp4', startFrom: 0, playbackRate: 1, blurRegions: [] } as ClipConfig,
    caption: { text: 'Reads PDF, Word and text files.', from: 10, to: 204 },
    small: { text: 'Direct Drive integration: next step', from: 20, to: 210 },
    entry: 'F4',
    result: { label: 'Revise before using', tone: 'check' as const },
    file: { name: '04-ai-briefing.pdf', size: '42 KB', chars: 599 },
    sim: {
      menuAt: 38,          // right-click menu on the PDF
      downloadAt: 62,      // 'Download' clicked, the file appears in the download bar
      dragFrom: 84, dropAt: 114,
      loadingAt: 114, reportAt: 136,
    },
    zoom: { from: 140, to: 166 },
    cursor: [
      { f: 0, x: 900, y: 700 }, { f: 30, x: 560, y: 496 }, { f: 36, x: 560, y: 496, click: true },
      { f: 56, x: 640, y: 572 }, { f: 62, x: 640, y: 572, click: true },
      { f: 80, x: 150, y: 1012 }, { f: 84, x: 150, y: 1012, click: true }, { f: 112, x: 1710, y: 600 },
    ] as CursorKey[],
    callouts: [
      { label: 'Revise', from: 170, to: 206, target: { part: 'stamp' }, labelAt: { x: 640, y: 190 }, width: 210 },
    ] as CalloutCfg[],
  },

  policy: {
    caption: { text: 'Every action quotes the clause.', from: 8, to: 146 },
    small: { text: "Based on RIMPA Global's published governance documents.", from: 14, to: 150 },
    entry: 'F4',
    policyId: 'PR4',
    cursor: [
      { f: 0, x: 1000, y: 700 }, { f: 24, x: 1330, y: 979 }, { f: 30, x: 1330, y: 979, click: true }, { f: 60, x: 1500, y: 700 },
    ] as CursorKey[],
    sheetAt: 34,
  },

  close: {
    line: 'Information management know-how, built into AI.',
    credit: 'TrustLens Lite - RIMPA Global Hackathon 2026',
    creditFrom: 34,
    small: 'Signals, not proof. A person makes the final call.',
  },

  audio: {
    music: { file: 'audio/music.mp3', volume: 0.18 },
    voiceover: { file: 'audio/voiceover.mp3', volume: 1 },
  },
};

// Captions are limited to 8 words. Checked when the project loads.
export function validateScript() {
  const caps = [script.gmail.caption.text, script.drive.caption.text, script.policy.caption.text];
  for (const t of caps) if (t.trim().split(/\s+/).length > 8) throw new Error(`Caption has more than 8 words: "${t}"`);
  const total = Object.values(script.scenes).reduce((n, s) => n + s.frames, 0);
  if (total !== TOTAL_FRAMES) throw new Error(`Scenes add up to ${total} frames, expected ${TOTAL_FRAMES}`);
}
