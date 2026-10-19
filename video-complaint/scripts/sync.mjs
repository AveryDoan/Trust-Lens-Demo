// Copies the prepared data from the product folder into src/data, so the video never retypes it.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.resolve(root, '../trustlens-lite/demo/case-complaint');
const dst = path.join(root, 'src/data');
mkdirSync(dst, { recursive: true });
const files = ['demo-result-complaint.json', 'demo-findings-map.json', 'demo-action-plan.json', 'demo-evidence.json', 'policies-harbourview.json'];
const present = {};
for (const f of files) {
  const from = path.join(src, f);
  present[f] = existsSync(from);
  if (present[f]) copyFileSync(from, path.join(dst, f));
}
writeFileSync(path.join(dst, 'sources.json'), JSON.stringify({ copied: present }, null, 2) + '\n');
console.log('synced:', Object.entries(present).map(([f, ok]) => `${f} ${ok ? 'yes' : 'MISSING'}`).join(', '));
