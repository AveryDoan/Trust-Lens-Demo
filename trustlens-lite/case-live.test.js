import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeCase, computeSide, validateExtraction, assessCase } from './case-live.js';
import { verifyCase } from './case.js';

const saved = JSON.parse(readFileSync('demo/case-complaint/demo-result-complaint.json', 'utf8'));
let failed = 0;
const run = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

// What a model might return for the demo bundle. The numbers below are inputs; every total and difference is recomputed.
const extraction = () => ({
  documents: [
    { index: 0, name: 'invoice.pdf', role: 'invoice', confidence: 0.97, keyFacts: ['INV-DEMO-20417'], pii: [] },
    { index: 1, name: 'agreement.pdf', role: 'agreement', confidence: 0.98, keyFacts: ['HRS-AGR-0311'], pii: [] },
    { index: 2, name: 'thread.pdf', role: 'correspondence', confidence: 0.95, keyFacts: [], pii: ['date of birth', 'home address', 'mobile numbers', 'email addresses'] },
  ],
  invoice: { number: 'INV-DEMO-20417', date: '2026-09-25', dueDate: '2026-10-09', lines: [{ description: 'RUSH', quantity: 2400, unitPrice: 8.35, amount: 20040 }], statedSubtotal: 20040, statedGst: 2004, statedTotal: 22044 },
  agreement: { reference: 'HRS-AGR-0311', signedDate: '2026-03-03', paymentTermsDays: 14, lines: [{ description: 'standard', quantity: 2400, unitPrice: 3.85, amount: 9240 }], statedSubtotal: 9240, statedGst: 924, statedTotal: 10164 },
  claims: [{ claim: 'Invoice is $11,880.00 higher than the agreement', status: 'supported' }, { claim: 'This is fraud', status: 'not_shown' }],
  flags: { billingDiscrepancy: true, writtenComplaint: true, personalInfoShared: true, staffAskedForPii: true, fraudAllegation: true, internalStallingMessage: true },
  quotes: { agreedRate: 'The standard rate is $3.85 per box (excluding GST).', billedRate: 'Archive box digitisation, RUSH tier', agreedSubtotal: 'FAKE QUOTE NOT IN THE DOCUMENT', billedSubtotal: 'Subtotal (ex GST)', agreedTotal: 'or $10,164.00 including GST', billedTotal: 'Payment received 2 October 2026: $22,044.00' },
  checks: { bias: { status: 'ok', answer: 'Firm wording.' }, accuracy: { status: 'concern', answer: 'Mismatch.' }, misleading: { status: 'concern', answer: 'Wrong impression.', quotes: [{ doc: 'invoice', text: 'Rush tier applied because processing was completed within 30 days of collection.' }, { doc: 'invoice', text: 'not in the invoice' }] }, governance: { status: 'concern', answer: 'Next steps.' } },
});
const docTexts = {
  invoice: 'Archive box digitisation, RUSH tier 2,400 boxes $8.35 Subtotal (ex GST) $20,040.00 Note: Rush tier applied because processing was completed within 30 days of collection. Payment received 2 October 2026: $22,044.00',
  agreement: 'The standard rate is $3.85 per box (excluding GST). or $10,164.00 including GST',
};

await run('composeCase computes $11,880.00, GST, totals and due dates in code, matching the saved result', () => {
  const r = composeCase(extraction(), { emailISO: '2026-10-19', docTexts });
  assert.deepEqual(verifyCase(r), []);
  assert.equal(r.case.totals.difference, 11880);
  assert.equal(r.stamp.title, saved.stamp.title);
  assert.equal(r.stamp.owner, saved.stamp.owner);
  assert.equal(r.stamp.due, saved.stamp.due);
  assert.deepEqual(r.stamp.basis, saved.stamp.basis);
  assert.deepEqual(r.case.reconciliation.map((x) => [x.item, x.agreed, x.billed, x.difference]), saved.case.reconciliation.map((x) => [x.item, x.agreed, x.billed, x.difference]));
  assert.deepEqual(r.case.nextSteps.map((s) => [s.action, s.owner, s.due, s.basis]), saved.case.nextSteps.map((s) => [s.action, s.owner, s.due, s.basis]));
  assert.equal(r.case.outcomeDue.date, saved.case.outcomeDue.date);
  assert.equal(r.case.otherComparisons[0].result, 'matches');
});
await run('quotes that are not in the document are dropped', () => {
  const r = composeCase(extraction(), { emailISO: '2026-10-19', docTexts });
  assert.equal(r.case.reconciliation[1].quoteAgreed, '');
  assert.equal(r.case.reconciliation[0].quoteAgreed, 'The standard rate is $3.85 per box (excluding GST).');
  assert.equal(r.checks.find((c) => c.key === 'misleading').quotes.length, 1);
});
await run('a stated total that does not equal the lines is flagged, never used', () => {
  const x = extraction(); x.invoice.statedTotal = 23000;
  const r = composeCase(x, { emailISO: '2026-10-19', docTexts });
  assert.equal(r.case.totals.billedTotal, 22044);
  assert.ok(r.case.warnings.some((w) => /does not equal the lines/.test(w)));
});
await run('a model that disagrees with the code cannot change the difference', () => {
  const x = extraction(); x.invoice.lines[0].unitPrice = 8.35; x.invoice.statedTotal = 99999;
  assert.equal(composeCase(x, { emailISO: '2026-10-19', docTexts }).case.totals.difference, 11880);
});
await run('a different email date moves every due date, weekends skipped', () => {
  const r = composeCase(extraction(), { emailISO: '2026-10-23', docTexts });
  assert.equal(r.case.nextSteps[0].due, '2026-10-26');
  assert.equal(r.stamp.due, '2026-10-29');
});
await run('no discrepancy: no refund stamp', () => {
  const x = extraction(); x.invoice.lines[0].unitPrice = 3.85; x.flags.billingDiscrepancy = false;
  const r = composeCase(x, { emailISO: '2026-10-19', docTexts });
  assert.equal(r.case.totals.difference, 0);
  assert.ok(!/refund/.test(r.stamp.title));
});
await run('validateExtraction rejects bad shapes; computeSide handles a single line', () => {
  assert.throws(() => validateExtraction({}), /documents/);
  assert.equal(computeSide({ lines: [{ quantity: 2, unitPrice: 1.25 }] }).total, 2.75);
});
await run('assessCase makes exactly one request and sends only the masked text it was given', async () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(extraction()) }] }) }; };
  try {
    const r = await assessCase([{ name: 'a.pdf', role: 'invoice', maskedText: 'mobile [PHONE] [EMAIL]' }], { model: 'claude-sonnet-5-5', endpoint: 'https://x.test', apiKey: 'k' }, { emailISO: '2026-10-19', docTexts });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].body.messages[0].content.includes('[PHONE]'));
    assert.equal(r.case.totals.difference, 11880);
  } finally { globalThis.fetch = real; }
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
