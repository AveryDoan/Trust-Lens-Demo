import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policies, policiesForPrompt } from './policies.js';

const pack = JSON.parse(readFileSync(new URL('./policies.json', import.meta.url), 'utf8'));
const words = (s) => s.trim().split(/\s+/).length;

assert.equal(pack.note, 'Synthetic demo content, not real policy');
assert.equal(Object.keys(pack)[0], 'note');
assert.equal(policies.length, 6);
assert.equal(new Set(policies.map((p) => p.id)).size, 6);
for (const p of policies) {
  assert.deepEqual(Object.keys(p), ['id', 'title', 'text', 'rule']);
  assert.ok(words(p.text) <= 90, `${p.id} text has ${words(p.text)} words`);
}
const out = policiesForPrompt();
assert.ok(words(out) < 1500, `helper output has ${words(out)} words`);
console.log(`ok: 6 unique policies, longest text ${Math.max(...policies.map((p) => words(p.text)))} words, prompt ${words(out)} words`);
