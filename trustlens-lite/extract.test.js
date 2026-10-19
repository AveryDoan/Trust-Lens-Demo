import assert from 'node:assert/strict';
import { cleanText, cleanPages, truncateAtWord, extractFile, FileError, formatSize } from './extract.js';
import { findDemoEntry } from './demo.js';
import { readFileSync } from 'node:fs';

let failed = 0;
const run = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

await run('curly quotes, en/em dashes, nbsp, ligatures and whitespace are normalised', () => {
  assert.equal(cleanText('Casey’s “notes” – a — b c   d\n\ne ﬁle'), 'Casey\'s "notes" - a - b c d e file');
  assert.equal(cleanText('  \n '), '');
  assert.equal(cleanText(null), '');
});
await run('hyphenated line ends are joined, real hyphens kept', () => {
  assert.equal(cleanText('inter-\nview and well-known and 2026-\n07'), 'interview and well-known and 2026- 07');
});
await run('page-number lines are removed, ordinary numbers kept', () => {
  assert.equal(cleanText('Intro\nPage 3 of 9\nmore\n- 4 -\nend 2026\n7 of 12'), 'Intro more end 2026');
});
await run('PDF pages: repeated headers and footers and lone page numbers are removed', () => {
  const pages = [1, 2, 3].map((n) => `RIMPA Global - Draft report\nBody text of page ${n} is here.\nPage ${n} of 3`);
  assert.equal(cleanPages(pages), 'Body text of page 1 is here. Body text of page 2 is here. Body text of page 3 is here.');
  assert.equal(cleanPages(['Only page\n1']), 'Only page');
  assert.equal(cleanPages(['One page with 12 items\nand 3 more']), 'One page with 12 items and 3 more');
});
await run('truncation cuts at a word and reports it', () => {
  assert.deepEqual(truncateAtWord('short', 10), { text: 'short', truncated: false });
  const r = truncateAtWord('word '.repeat(2000), 6000);
  assert.ok(r.truncated && r.text.length <= 6000 && r.text.endsWith('word'));
});
await run('extractFile: txt and md are read as text; errors are plain language', async () => {
  const md = new File([readFileSync('demo/docs/01-case-note.md', 'utf8')], '01-case-note.md');
  const r = await extractFile(md);
  assert.equal(r.kind, 'md'); assert.ok(r.text.includes('Casey did it: there is no doubt')); assert.ok(!r.text.includes('\n'));
  await assert.rejects(extractFile(new File(['x'], 'a.exe')), (e) => e instanceof FileError && /not supported/.test(e.message));
  await assert.rejects(extractFile(new File([''], 'a.txt')), /empty/);
  await assert.rejects(extractFile(new File(['   \n  '], 'a.txt')), /no readable text/);
  await assert.rejects(extractFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.txt')), /larger than 5 MB/);
});
await run('formatSize', () => { assert.equal(formatSize(512), '512 B'); assert.equal(formatSize(2048), '2 KB'); assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB'); });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
