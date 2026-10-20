// out/stills/: the middle frame of each scene of the 60 second video, plus boxes.png (every highlight box over the screenshot)
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const t = JSON.parse(readFileSync(path.join(root, 'src/data/timeline60.json'), 'utf8'));
mkdirSync(path.join(root, 'out/stills'), { recursive: true });
const run = (comp, out, frame) => execFileSync('npx', ['remotion', 'still', 'src/index.ts', comp, out, `--frame=${frame}`], { cwd: root, stdio: 'ignore' });
for (const s of t.scenes) { const f = Math.floor((s.from + s.to) / 2); run('ComplaintDemo60', `out/stills/60-${s.id}-f${f}.png`, f); console.log('still', s.id, f); }
run('Boxes60', 'out/stills/boxes.png', 0); console.log('still boxes');
