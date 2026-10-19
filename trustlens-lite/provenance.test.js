import assert from 'node:assert/strict';
import { parsePdfDate, normaliseMeta, provenanceSignals, provenanceSummary, printedDate, isEmptyMeta, NOTE, CLEAN } from './provenance.js';
import { readFileSync } from 'node:fs';

let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };
const ids = (s) => s.filter((x) => x.severity === 'check').map((x) => x.id);
const INVOICE = 'TAX INVOICE Harbourview Records Services Pty Ltd Invoice number INV-DEMO-20417 Invoice date 25 September 2026';

run('PDF dates parse, with and without an offset', () => {
  assert.equal(parsePdfDate("D:20261019112206+00'00'"), '2026-10-19T11:22:06Z');
  assert.equal(parsePdfDate("D:20261018211400+11'00'"), '2026-10-18T21:14:00+11:00');
  assert.equal(parsePdfDate('D:20261019112206Z'), '2026-10-19T11:22:06Z');
  assert.equal(parsePdfDate('not a date'), '');
  assert.equal(parsePdfDate(undefined), '');
});
run('Producer Canva with ModDate after CreationDate gives P1 and P3', () => {
  const meta = normaliseMeta({ Creator: 'Canva', Producer: 'Canva', CreationDate: "D:20261019100000+00'00'", ModDate: "D:20261019100500+00'00'" });
  const s = provenanceSignals({ meta, role: 'agreement', text: '' });
  assert.deepEqual(ids(s), ['P1', 'P3']);
  assert.equal(provenanceSummary(s), '2 signals: verify at source');
});
run('a clean Word file gives no signals', () => {
  const meta = normaliseMeta({ Creator: 'Microsoft Word', Producer: 'Microsoft Word', CreationDate: "D:20260303102000+11'00'", ModDate: "D:20260303102000+11'00'", Author: 'Harbourview Records Services' });
  const s = provenanceSignals({ meta, role: 'agreement', text: 'Service agreement HRS-AGR-0311 signed 3 March 2026. Harbourview Records Services Pty Ltd', fromMail: true });
  assert.deepEqual(s, []);
  assert.equal(provenanceSummary(s), 'No signals');
});
run('the Canva invoice fixture gives P1, P3 and P4 (3 signals: verify at source)', () => {
  const saved = JSON.parse(readFileSync('demo/case-complaint/demo-result-complaint.json', 'utf8'));
  const fx = saved.provenance[saved.case.documents.find((d) => d.role === 'invoice').name];
  const s = provenanceSignals({ meta: normaliseMeta(fx.demoMetadata), role: 'invoice', text: INVOICE });
  assert.deepEqual(ids(s), fx.signals);
  assert.equal(provenanceSummary(s), fx.summary);
});
run('a browser-printed invoice created long after its date shows P4 only', () => {
  const meta = normaliseMeta({ Creator: 'Chromium', Producer: 'Skia/PDF m153', CreationDate: "D:20261019112206+00'00'", ModDate: "D:20261019112206+00'00'" });
  const s = provenanceSignals({ meta, role: 'invoice', text: INVOICE });
  assert.deepEqual(ids(s), ['P4']);
  assert.equal(provenanceSummary(s), '1 signal: check');
});
run('correspondence is not compared with a printed date (P4 is for invoices and agreements)', () => {
  const meta = normaliseMeta({ Creator: 'Chromium', Producer: 'Skia/PDF', CreationDate: "D:20261019112206+00'00'" });
  assert.deepEqual(ids(provenanceSignals({ meta, role: 'correspondence', text: 'Exported 14 October 2026' })), []);
});
run('P5 for a file with no metadata at all; P6 for a different organisation as author; P7 for dropped files only', () => {
  assert.ok(isEmptyMeta(normaliseMeta({})));
  assert.deepEqual(ids(provenanceSignals({ meta: normaliseMeta({}), role: 'other', text: '' })), ['P5']);
  const meta = normaliseMeta({ Creator: 'Microsoft Word', Author: 'Acme Trading Pty Ltd', CreationDate: "D:20260925090000+10'00'", ModDate: "D:20260925090000+10'00'" });
  assert.deepEqual(ids(provenanceSignals({ meta, role: 'invoice', text: INVOICE, fromMail: true })), ['P6']);
  assert.ok(provenanceSignals({ meta, role: 'invoice', text: INVOICE, fromMail: false }).some((x) => x.id === 'P7' && x.severity === 'info'));
  assert.ok(!provenanceSignals({ meta, role: 'invoice', text: INVOICE, fromMail: true }).some((x) => x.id === 'P7'));
});
run('printed dates are read from invoices and agreements', () => {
  assert.equal(printedDate(INVOICE, 'invoice'), '2026-09-25');
  assert.equal(printedDate('Service Agreement HRS-AGR-0311 signed 3 March 2026', 'agreement'), '2026-03-03');
});
run('wording: no signal text or summary contains "fraud", "forged" or "fake"', () => {
  const all = [];
  for (const [creator, role] of [['Canva', 'invoice'], ['Photoshop', 'agreement'], ['', 'other'], ['Chromium', 'invoice']]) {
    const meta = normaliseMeta({ Creator: creator, CreationDate: "D:20261019100000Z", ModDate: "D:20261019120000Z", Author: 'Acme Ltd' });
    const s = provenanceSignals({ meta, role, text: INVOICE });
    all.push(provenanceSummary(s), ...s.flatMap((x) => [x.label, x.reason]));
  }
  all.push(NOTE, CLEAN);
  for (const t of all) assert.ok(!/fraud|forged|fake|forgery/i.test(t), t);
  assert.equal(NOTE, 'Metadata can be changed or removed. It is a clue, not proof.');
  assert.equal(CLEAN, 'No signals found. This does not prove it is genuine.');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
