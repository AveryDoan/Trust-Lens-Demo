// Renders a PNG of the middle frame of each scene (plus S8's file-details half) into out/stills/
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timeline = JSON.parse(readFileSync(path.join(root, 'src/timeline.json'), 'utf8'));
mkdirSync(path.join(root, 'out/stills'), { recursive: true });
const extra = [];
const list = [...timeline.scenes.map((s) => ({ id: s.id, frame: Math.floor((s.from + s.to) / 2) })), ...extra];
for (const { id, frame } of list) {
  const out = `out/stills/${id}-f${frame}.png`;
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'ComplaintDemo', out, `--frame=${frame}`], { cwd: root, stdio: 'inherit' });
}
