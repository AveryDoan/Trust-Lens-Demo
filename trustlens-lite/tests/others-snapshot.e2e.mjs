// Snapshot of the rendered text of the earlier demos (emails A, B, C and files 01 to 04) in Demo mode.
// Run with the panel served (python3 -m http.server 8765 in trustlens-lite):
//   node tests/others-snapshot.e2e.mjs            compare with tests/snapshots/others-level1.json
//   node tests/others-snapshot.e2e.mjs --update   rewrite the snapshot
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';

const root = process.cwd();
const SNAP = path.join(root, 'tests/snapshots/others-level1.json');
const { send, ev, sleep, close } = await launch(9355, path.join(tmpdir(), 'tl-snapshot-profile'));
await send('Page.enable'); await send('DOM.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const out = {};
async function fresh() {
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8765/panel.html' }); await sleep(900);
  await ev('localStorage.clear(); 1');
}
const grab = () => ev(`JSON.stringify({ view: document.getElementById('view').innerText, stamp: document.querySelector('.stamp-label')?.innerText ?? null })`).then(JSON.parse);
try {
  for (const k of ['a', 'b', 'c']) {
    await fresh();
    await ev(`document.getElementById('text').value = ${JSON.stringify(readFileSync(path.join(root, `demo/emails/${k}.txt`), 'utf8'))}; document.getElementById('run').click(); 1`);
    await sleep(3000);
    out[`email-${k}`] = await grab();
  }
  for (const f of ['01-case-note', '02-election-flyer', '03-governance-update', '04-ai-briefing']) {
    await fresh();
    const doc = await send('DOM.getDocument'); const n = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file-input' });
    await send('DOM.setFileInputFiles', { files: [path.join(root, `demo/docs/${f}.md`)], nodeId: n.nodeId });
    await sleep(3200);
    out[`file-${f}`] = await grab();
  }
} finally { close(); }
if (process.argv.includes('--update')) { writeFileSync(SNAP, JSON.stringify(out, null, 2) + '\n'); console.log('snapshot written:', Object.keys(out).join(', ')); }
else {
  const want = JSON.parse(readFileSync(SNAP, 'utf8'));
  assert.deepEqual(out, want);
  console.log('earlier demos: rendered text unchanged:', Object.keys(out).join(', '));
}
