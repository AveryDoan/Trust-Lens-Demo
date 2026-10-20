// Renders both versions of the 60 second video and reports what it used.
//   out/complaint-demo-60-captions.mp4  (burned-in captions)
//   out/complaint-demo-60-clean.mp4     (no captions, for the voiceover)
// If public/voiceover.mp3 exists it plays from frame 0; otherwise the files are silent.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const timeline = JSON.parse(readFileSync(path.join(root, 'src/data/timeline60.json'), 'utf8'));
const voice = existsSync(path.join(root, 'public/voiceover.mp3'));
const clipFor = (s) => existsSync(path.join(root, 'public/clips', `${s.clip}.mp4`));
const jobs = [['complaint-demo-60-captions.mp4', { captions: true }], ['complaint-demo-60-clean.mp4', { captions: false }]];
const report = [];
for (const [file, props] of jobs) {
  const t0 = Date.now();
  const args = ['remotion', 'render', 'src/index.ts', 'ComplaintDemo60', `out/${file}`, `--props=${JSON.stringify(props)}`, ...(voice ? [] : ['--muted'])];
  execFileSync('npx', args, { cwd: root, stdio: 'ignore' });
  const sec = Math.round((Date.now() - t0) / 1000);
  const mb = (statSync(path.join(root, 'out', file)).size / 1048576).toFixed(1);
  report.push(`${file}: ${mb} MB, rendered in ${sec} s`);
}
console.log(report.join('\n'));
console.log(`voiceover: ${voice ? 'public/voiceover.mp3 plays from frame 0' : 'none (silent)'}`);
console.log('scenes:\n' + timeline.scenes.map((s) => `  ${s.id} ${s.from}-${s.to}: ${clipFor(s) ? `clip ${s.clip}.mp4` : 'simulated'}`).join('\n'));
