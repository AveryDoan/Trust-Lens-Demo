// Searches the whole 60 second video for text. Renders the page text of every Nth frame (default 10) in headless Chrome and
// prints where each phrase first and last appears. Usage: node scripts/probe60.mjs [step]
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { writeFileSync, mkdirSync } from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');
const step = Number(process.argv[2] ?? 10);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), onProgress: () => {} });
const inputProps = { facts: undefined, captions: false, probe: true };
const comp = await selectComposition({ serveUrl, id: 'ComplaintDemo60', browserExecutable: chrome });
const texts = new Map();
mkdirSync(path.join(root, 'out/tmp'), { recursive: true });
const frames = [...new Set([...Array.from({ length: Math.ceil(1800 / step) }, (_, i) => i * step), 1409, 1410, 1799])].sort((a, b) => a - b);
for (const frame of frames) {
  await renderStill({ composition: { ...comp, props: { ...comp.props, captions: false, probe: true } }, serveUrl, frame, output: path.join(root, 'out/tmp/probe.jpg'), imageFormat: 'jpeg', browserExecutable: chrome, inputProps: { captions: false, probe: true },
    onBrowserLog: (l) => { if (l.text.startsWith('PROBE ')) { const o = JSON.parse(l.text.slice(6)); texts.set(o.f, o.t); } } });
}
writeFileSync(path.join(root, 'out/tmp/probe.json'), JSON.stringify([...texts.entries()]));
const find = (re) => [...texts.entries()].filter(([, t]) => re.test(t)).map(([f]) => f);
const phrases = [
  ['Approve $11,880.00 refund and corrected invoice', /Approve \$11,880\.00 refund and corrected invoice/],
  ['See the path', /See the path/], ['Also needed', /Also needed/], ['Recommended next step', /Recommended next step/],
  ['Because ACCURACY (stamp label)', /BECAUSE ACCURACY/i], ['due Fri 23 Oct', /due Fri 23 Oct/],
  ['claims summary', /2 claims supported/], ['our own / internal message does the same', /Our own|does the same/i],
  ['Small regional clients (the stalling message)', /Small regional clients|give up if we stall/], ['[DOB] (the thread\'s personal details)', /date of birth is|\[DOB\]/], ['[ADDRESS] / [EMAIL] tags (the redacted invoice)', /\[ADDRESS\]|\[EMAIL\]/],
  ['Correspondence-thread.pdf page', /Correspondence-thread\.pdf\s*\n?\s*…/],
];
let bad = 0;
console.log(`probed ${frames.length} frames (every ${step})`);
for (const [name, re] of phrases) {
  const at = find(re);
  console.log(`${name}: ${at.length ? `frames ${at[0]}-${at[at.length - 1]} (${at.length} probed)` : 'never'}`);
}
const early = (re) => find(re).filter((f) => f < 1410);
for (const [name, re] of phrases.slice(0, 6)) { const e = early(re); if (e.length) { bad++; console.log(`  FAIL ${name} appears before frame 1410 at: ${e.join(', ')}`); } }
for (const [name, re] of phrases.slice(6, 9).filter(([n]) => !n.startsWith('Small') && !n.startsWith('['))) { const e = find(re); if (e.length) { bad++; console.log(`  FAIL ${name} appears at: ${e.join(', ')}`); } }
const s5 = find(/Small regional clients|give up if we stall|date of birth is|\[DOB\]|Correspondence-thread\.pdf\s*\n?\s*…/).filter((f) => f >= 1050 && f <= 1409);
if (s5.length) { bad++; console.log(`  FAIL correspondence page content in S5 at: ${s5.join(', ')}`); }
console.log(bad ? `${bad} problem(s)` : 'PROBE OK');
process.exit(bad ? 1 : 0);
