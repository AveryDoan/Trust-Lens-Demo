import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { policies, policiesForPrompt } from './policies.js';
import { citation, citationsFor, formatCitation, retentionFor, knownIds } from './cite.js';

const DOC_FILES = {
  'Complaints and Grievance Policy': 'complaints-and-grievance-policy',
  'Privacy Policy': 'privacy-policy',
  'Code of Professional Conduct': 'code-of-professional-conduct',
  'Election Campaign Code of Conduct': 'election-campaign-code-of-conduct',
};
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const docText = Object.fromEntries(Object.entries(DOC_FILES).map(([name, f]) => [name, squash(readFileSync(`policies/${f}.txt`, 'utf8'))]));
const words = (s) => s.trim().split(/\s+/).length;
let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

run('17 entries with unique ids and the required fields', () => {
  assert.equal(policies.length, 17);
  assert.equal(new Set(policies.map((p) => p.id)).size, 17);
  for (const p of policies) for (const k of ['id', 'document', 'version', 'section', 'quote', 'rule']) assert.ok(typeof p[k] === 'string' && p[k], `${p.id}.${k}`);
  assert.deepEqual([...knownIds].sort(), ['C1','C2','C3','C4','C5','CP1','CP2','EC1','EC2','EC3','EC4','PR1','PR2','PR3','PR4','PR5','V1']);
});

run('every quote is verbatim in the PDF text (segments joined by " … ")', () => {
  for (const p of policies) {
    if (p.id === 'PR3') continue;
    const parts = p.parts ?? [p];
    for (const part of parts) {
      const text = docText[part.document];
      assert.ok(text, `${p.id}: unknown document ${part.document}`);
      for (const seg of part.quote.split(' … ')) assert.ok(text.includes(squash(seg)), `${p.id}: not verbatim: ${seg.slice(0, 70)}`);
    }
  }
});

run('PR3 gap: the Privacy Policy has no AI or automated-decision provision', () => {
  const pr3 = policies.find((p) => p.id === 'PR3');
  assert.equal(pr3.quote, 'No provision found');
  assert.ok(!/artificial intelligence|\bAI\b|automated decision|algorithm|machine learning|chatbot|generative/i.test(docText['Privacy Policy']));
});

run('versions match each document-control table', () => {
  const rows = { 'Privacy Policy': '3.0 11 May 2026', 'Code of Professional Conduct': '3.0 8 June 2026', 'Election Campaign Code of Conduct': '2.0 3 September 2025', 'Complaints and Grievance Policy': '3.0 18 November 2024' };
  for (const [doc, row] of Object.entries(rows)) assert.ok(docText[doc].includes(row), doc);
  for (const p of policies) if (p.version !== 'see parts') assert.ok(docText[p.document].includes(`${p.version} `), p.id);
});

run('no fixed retention period is stated in any rule or quote we wrote', () => {
  for (const p of policies) assert.ok(!/\b(\d+|one|two|three|four|five|six|seven|ten)[- ](years?|months?)\b/i.test(p.rule), `${p.id} rule`);
  assert.ok(!/years?/.test(retentionFor({ governance: { basis: ['C3'] } })));
  assert.ok(!/\d/.test(retentionFor({})));
});

run('citation lookup, unknown ids, empty quotes and the copy format', () => {
  assert.equal(citation('ZZ9'), null);
  assert.deepEqual(citationsFor(['C1', 'ZZ9']).map((c) => c.id), ['C1']);
  const text = formatCitation('Revise before using', citationsFor(['C1']), '19 October 2026');
  assert.equal(text, 'Recommended action: Revise before using. Basis: RIMPA Global Complaints and Grievance Policy v3.0, s10.3: "All grievances should be referred to as allegations until the findings of the investigation are made.". Checked with TrustLens Lite on 19 October 2026; a person makes the final decision.');
  assert.match(formatCitation('OK to use', [], 'x'), /Basis: TrustLens guidance, not RIMPA policy\./);
  assert.match(formatCitation('OK to use', [{ document: 'D', version: '1', section: '2', quote: '', parts: null }], 'x'), /RIMPA Global D v1, s2\. Checked/);
  assert.equal(citationsFor(['V1']).length, 1);
});

run('prompt text is under 1,500 words and names every id', () => {
  const out = policiesForPrompt();
  assert.ok(words(out) < 1500, `${words(out)} words`);
  for (const id of knownIds) assert.ok(out.includes(`${id} (`), id);
  console.log('        prompt words:', words(out));
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
