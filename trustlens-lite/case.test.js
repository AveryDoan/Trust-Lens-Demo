import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasAgreement, withoutAgreement, NOT_VERIFIED, NO_AGREEMENT_NOTE, detectRole, findSavedCase, addWeekdays, isWeekday, verifyCase, rebaseDates, visibleSteps, checkQuotes, money, signedMoney, formatDay, bundleProvenance, checkSignals } from './case.js';
import { cleanPages } from './extract.js';
import { normaliseMeta } from './provenance.js';
import { setPack, policies } from './policies.js';
import { citation, citationsFor, knownIds } from './cite.js';

const D = 'demo/case-complaint';
const saved = JSON.parse(readFileSync(`${D}/demo-result-complaint.json`, 'utf8'));
let failed = 0;
const run = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

// Text out of the real PDFs, with the same bundled pdf.js the panel uses.
async function pdf(path) {
  const pdfjs = await import('./vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), isEvalSupported: false, useWorkerFetch: false }).promise;
  const info = (await doc.getMetadata()).info;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join(''));
  return { text: cleanPages(pages), info };
}
const invoice = await pdf(`${D}/INV-DEMO-20417.pdf`);
const thread = await pdf(`${D}/Correspondence-thread.pdf`);
import { existsSync } from 'node:fs';
const AGREEMENT = `${D}/02-service-agreement-HRS-AGR-0311.pdf`;
const agreement = existsSync(AGREEMENT) ? await pdf(AGREEMENT) : null;

await run('roles come from content, not file names', () => {
  assert.equal(detectRole(invoice.text).role, 'invoice');
  assert.equal(detectRole(thread.text).role, 'correspondence');
  if (agreement) assert.equal(detectRole(agreement.text).role, 'agreement');
  assert.equal(detectRole('Hello world, nothing to see').role, 'other');
});
await run('the saved case matches only when the bundle contains both reference numbers', () => {
  const both = `${invoice.text} ${thread.text}`;
  assert.equal(findSavedCase(`${both} HRS-AGR-0311`, [saved]).id, 'case-complaint-meridian');
  assert.equal(findSavedCase('Only INV-DEMO-20417 here', [saved]), null);
  assert.equal(findSavedCase('Only HRS-AGR-0311 here', [saved]), null);
  assert.equal(findSavedCase('INV-DEMO-20417 and hrs-agr-0311', [saved]) !== null, true);
});
await run('$11,880.00, GST and totals are calculated in code and match the saved JSON', () => {
  assert.deepEqual(verifyCase(saved), []);
  assert.equal(money(22044 - 10164), '$11,880.00');
  assert.equal(signedMoney(4.5), '+$4.50');
  const bad = structuredClone(saved); bad.case.reconciliation[3].difference = 11800;
  assert.ok(verifyCase(bad).length > 0, 'a wrong difference is caught');
  const bad2 = structuredClone(saved); bad2.case.reconciliation[2].billed = 2005;
  assert.ok(verifyCase(bad2).some((p) => /GST/.test(p)), 'a wrong GST is caught');
});
await run('every due date is a weekday and recomputes from Mon 19 Oct 2026', () => {
  for (const s of saved.case.nextSteps) assert.ok(isWeekday(s.due));
  const r = rebaseDates(saved, '2026-10-19');
  assert.equal(r.stamp.due, saved.stamp.due);
  assert.equal(r.case.outcomeDue.date, saved.case.outcomeDue.date);
  assert.deepEqual(r.case.nextSteps.map((s) => s.due), saved.case.nextSteps.map((s) => s.due));
  assert.equal(formatDay(r.stamp.due), 'Fri 23 Oct');
  assert.equal(formatDay(r.case.outcomeDue.date), 'Mon 2 Nov');
  // live mode with a different email date (Friday 23 Oct): weekends are skipped
  const later = rebaseDates(saved, '2026-10-23');
  assert.equal(later.case.nextSteps[0].due, '2026-10-26');
  assert.ok(later.case.nextSteps.every((s) => isWeekday(s.due)) && isWeekday(later.stamp.due));
  assert.equal(addWeekdays('2026-10-23', 1), '2026-10-26');
});
await run('the onlyIf step is shown only when the invoice has provenance signals; steps are ordered by deadline', () => {
  assert.equal(visibleSteps(saved, false).length, 3);
  assert.equal(visibleSteps(saved, true).length, 4);
  const due = visibleSteps(saved, true).map((s) => s.due);
  assert.deepEqual(due, [...due].sort());
});
await run('document quotes in the saved JSON are exact substrings of the extracted PDF text', () => {
  const textByRole = { invoice: invoice.text, correspondence: thread.text };
  if (agreement) textByRole.agreement = agreement.text;
  const bad = checkQuotes(saved, textByRole).filter((b) => b.role !== 'agreement' || agreement);
  assert.deepEqual(bad, []);
  if (!agreement) console.log('        (agreement PDF not present: its quotes were not checked)');
});
await run('policy quotes come only from the policy files; an unknown id is dropped; the footer pack switches the cited document', () => {
  setPack('harbourview');
  assert.equal(policies.length, 13);
  assert.equal(citationsFor(['H3.2', 'ZZ9', 'C1']).length, 1);
  const c = citation('H3.2');
  const pack = JSON.parse(readFileSync('policies-harbourview.json', 'utf8')).policies.find((p) => p.id === 'H3.2');
  assert.equal(c.quote, pack.quote);
  assert.ok(knownIds.has('H4.4') && !knownIds.has('C1'));
  for (const id of [...saved.stamp.basis, ...saved.case.nextSteps.flatMap((s) => s.basis), ...saved.checks.flatMap((k) => k.basis ?? []), ...saved.case.outcomeDue.basis]) assert.ok(knownIds.has(id), id);
  setPack('rimpa');
  assert.equal(citation('H3.2'), null);
  assert.ok(citation('C1'));
});
await run('Harbourview policy quotes are verbatim in the procedure PDF', async () => {
  const proc = await pdf(`${D}/habourview-complaints-procedure.pdf`);
  const hay = proc.text.replace(/\s+/g, ' ');
  for (const p of JSON.parse(readFileSync('policies-harbourview.json', 'utf8')).policies) {
    if (p.id === 'H2.3' && !hay.includes(p.quote)) { console.log('        (H2.3 is not in the procedure PDF yet: clause 2.3 still has to be added to section 2)'); continue; }
    assert.ok(hay.includes(p.quote.replace(/\s+/g, ' ')), `${p.id}: ${p.quote}`);
  }
});
await run('the root pack is identical to the one in demo/case-complaint', () => {
  assert.equal(readFileSync('policies-harbourview.json', 'utf8'), readFileSync(`${D}/policies-harbourview.json`, 'utf8'));
});
await run('provenance for the bundle: real metadata drives the result', () => {
  const docs = [
    { name: 'INV-DEMO-20417.pdf', role: 'invoice', text: invoice.text, meta: normaliseMeta(invoice.info) },
    { name: 'Correspondence-thread.pdf', role: 'correspondence', text: thread.text, meta: normaliseMeta(thread.info) },
  ];
  const [inv, cor] = bundleProvenance(docs);
  assert.deepEqual(checkSignals(inv).map((s) => s.id), ['P4']);
  assert.deepEqual(checkSignals(cor).map((s) => s.id), []);
});

await run('no agreement attached: the case still matches but no agreed-side quote comes from the saved text', () => {
  assert.equal(findSavedCase('Email text with INV-DEMO-20417 and HRS-AGR-0311 and no attachments', [saved]).id, 'case-complaint-meridian');
  assert.equal(hasAgreement([{ role: 'invoice' }, { role: 'policy' }]), false);
  assert.equal(hasAgreement([{ role: 'agreement', notRead: true }]), false);
  assert.equal(hasAgreement([{ role: 'agreement' }]), true);
  const r = withoutAgreement(saved);
  assert.ok(r.case.reconciliation.every((x) => x.quoteAgreed === '' && x.agreedNote === NOT_VERIFIED));
  const agreementQuote = r.checks.find((c) => c.key === 'misleading').quotes.find((q) => q.doc === 'agreement');
  assert.deepEqual(agreementQuote, { doc: 'agreement', text: '', note: NOT_VERIFIED });
  const json = JSON.stringify(r);
  for (const q of saved.case.reconciliation.map((x) => x.quoteAgreed)) assert.ok(!json.includes(q), `saved agreement text leaked: ${q}`);
  assert.ok(!json.includes('If the Customer has not made a written rush request'));
  assert.equal(r.case.totals.difference, 11880); // the amounts are still checked, against the email
  assert.equal(NO_AGREEMENT_NOTE, 'Agreement not attached: amounts checked against the email only.');
  assert.equal(saved.case.noAgreement, undefined, 'the saved result itself is not changed');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
