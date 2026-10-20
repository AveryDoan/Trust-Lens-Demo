// Evidence tests: every prepared quote is found in the redacted text of the real files, and nothing unverified or personal is shown.
// Run: node evidence.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFile, cleanText } from './extract.js';
import { scanPii } from './pii.js';
import { detectRole } from './case.js';
import { caseEmailText } from './tests/case-email.mjs';
import { resolveEvidence, verifyEntry, levelTwoItems, auditCounts, evidenceText, safeText, foundLine, NOT_FOUND } from './evidence.js';

const D = 'demo/case-complaint/';
const evidence = JSON.parse(readFileSync(D + 'demo-evidence.json', 'utf8'));
let failed = 0;
const run = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

const FILES = ['INV-DEMO-20417.pdf', '02-service-agreement-HRS-AGR-0311.pdf', 'Correspondence-thread.pdf'];
const load = async () => {
  const docs = [];
  for (const name of FILES) {
    const r = await extractFile(new File([readFileSync(D + name)], name));
    docs.push({ name, kind: r.kind, text: r.text, pageTexts: r.pageTexts, pages: r.pages, role: detectRole(r.text).role });
  }
  // The open Gmail message body (the text of the test fixture)
  // case-email.txt is the complaint email as prepared with the data. Without it, the older Gmail fixture is used and the
  // quotes that only the new email holds cannot be verified.
  const html = readFileSync('tests/fixtures/gmail-complaint.html', 'utf8');
  docs.push({ name: 'Open email', kind: 'email', text: cleanText(caseEmailText() ?? html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')), role: 'email' });
  for (const d of docs) d.masked = scanPii(d.text).maskedText;
  return docs;
};
const fresh = async () => load(); // new objects each time, so a changed text is not cached

const quotes = (e) => [...Object.entries(e.steps), ...Object.entries(e.callouts)].flatMap(([id, list]) => list.filter((q) => q.kind !== 'metadata').map((q) => ({ id, ...q })));

await run('1 every prepared quote is found in the redacted text of its file', async () => {
  const docs = await load();
  const haveEmail = caseEmailText() !== null;
  const missing = quotes(evidence).filter((q) => verifyEntry(q, docs).status !== 'verified');
  // the quotes that only the updated complaint email holds can be checked only once case-email.txt is present
  const pending = missing.filter((q) => q.doc === 'email' && !haveEmail);
  assert.deepEqual(missing.filter((q) => !pending.includes(q)).map((q) => `${q.id}: "${q.text}" (${q.doc})`), [], 'quotes not found');
  if (pending.length) console.log(`        SKIPPED ${pending.length} quote(s): demo/case-complaint/case-email.txt is missing:\n          ${pending.map((q) => `${q.id}: ${q.text}`).join('\n          ')}`);
  assert.equal(quotes(evidence).length, 20);
  assert.deepEqual(Object.keys(evidence.steps), ['approve', 'privacy', 'refer', 'acknowledge', 'verify', 'bias', 'claims']);
});

await run('1b the three PDFs alone: email quotes are "not read", file quotes are verified', async () => {
  const docs = (await load()).filter((d) => d.kind !== 'email');
  const ev = resolveEvidence(evidence, docs);
  const all = Object.values(ev.steps).flat().filter((i) => i.kind === 'quote');
  assert.ok(all.filter((i) => i.doc === 'email').every((i) => i.status === 'notread'));
  assert.ok(all.filter((i) => i.doc !== 'email').every((i) => i.status === 'verified'));
});

await run('2 a quote whose file text changed is "not found" and its text is never kept', async () => {
  const docs = await fresh();
  const inv = docs.find((d) => d.role === 'invoice');
  inv.masked = inv.masked.replace('Rush tier applied', 'Standard tier applied'); inv.pageMasked = null;
  const ev = resolveEvidence(evidence, docs);
  const item = ev.steps.approve.find((i) => i.shows === 'Why the invoice says it charged rush');
  assert.equal(item.status, 'notfound'); assert.equal(item.text, undefined);
  assert.ok(!JSON.stringify(item).includes('Rush tier applied'));
  assert.equal(NOT_FOUND, 'Not found in the file you dropped');
});

await run('2b a file that was not read gives "notread"', async () => {
  const docs = (await load()).map((d) => (d.role === 'agreement' ? { ...d, notRead: true } : d));
  const item = resolveEvidence(evidence, docs).steps.approve[0];
  assert.equal(item.status, 'notread'); assert.equal(item.text, undefined);
});

await run('matching ignores whitespace, table pipes and curly quotes on both sides', () => {
  const docs = [{ role: 'invoice', kind: 'pdf', name: 'x.pdf', text: 'a', masked: 'Payment  received | 2 October 2026:   $22,044.00 and the customer’s “note”' }];
  assert.equal(verifyEntry({ doc: 'invoice', text: 'Payment received 2 October 2026: $22,044.00' }, docs).status, 'verified');
  assert.equal(verifyEntry({ doc: 'invoice', text: "the customer's \"note\"" }, docs).status, 'verified');
});

await run('3 the privacy quote keeps [DOB] and [ADDRESS]; no original date of birth or address appears anywhere', async () => {
  const docs = await load();
  const corr = docs.find((d) => d.role === 'correspondence');
  const dob = /date of birth is ([^.]+?) and my home address is ([^.]+)\./i.exec(corr.text);
  assert.ok(dob, 'the original details exist in the unmasked text');
  const ev = resolveEvidence(evidence, docs);
  const p = ev.steps.privacy.find((i) => i.shows === 'Customer sent them by email');
  assert.equal(p.text, 'my date of birth is [DOB] and my home address is [ADDRESS]');
  const everything = JSON.stringify(ev) + evidenceText({ action: 'A', items: ev.steps.privacy, rule: 'R' });
  assert.ok(!everything.includes(dob[1]) && !everything.includes(dob[2]), 'no original personal details');
  assert.ok(!/@[a-z]/i.test(everything), 'no email address');
});

await run('a stored quote that holds a personal detail is masked before display', () => {
  assert.equal(safeText('Call me on 0412 345 678 or jo@example.com'), 'Call me on [PHONE] or [EMAIL]');
});

await run('shown quotes are unchanged by masking (the stored text is the displayed text)', async () => {
  const ev = resolveEvidence(evidence, await load());
  for (const [id, list] of Object.entries(evidence.steps)) list.forEach((e, i) => { if (e.kind !== 'metadata' && ev.steps[id][i].status === 'verified') assert.equal(ev.steps[id][i].text, e.text, e.text); });
});

await run('page numbers: found quotes carry a page of a 2-page file, and the line reads "Found in <file>, page N"', async () => {
  const ev = resolveEvidence(evidence, await load());
  const rate = ev.steps.approve[0];
  assert.ok(rate.page >= 1 && rate.page <= 2, `page ${rate.page}`);
  assert.equal(foundLine(rate), `Found in Agreement, page ${rate.page}`);
  assert.equal(foundLine({ label: 'Complaint email', page: null }), 'Found in Complaint email');
});

await run('Level 2 lists: accuracy = approve, governance = privacy, misleading = refer + the two rush quotes', async () => {
  const ev = resolveEvidence(evidence, await load());
  assert.equal(levelTwoItems('accuracy', ev, evidence), ev.steps.approve);
  assert.equal(levelTwoItems('governance', ev, evidence), ev.steps.privacy);
  const m = levelTwoItems('misleading', ev, evidence);
  assert.equal(m.length, 4);
  assert.deepEqual(m.slice(2).map((i) => i.doc), ['invoice', 'agreement']);
  assert.match(m[2].text, /^Rush tier applied/); assert.match(m[3].text, /^If the Customer has not made a written rush request/);
});

await run('Level 2 lists: bias = the one bias quote (from the email); the claims step pairs the customer sentence with the file sentence', async () => {
  const ev = resolveEvidence(evidence, await load());
  assert.equal(levelTwoItems('bias', ev, evidence), ev.steps.bias);
  assert.deepEqual(ev.steps.bias.map((i) => i.doc), ['email']);
  assert.ok(!JSON.stringify(evidence).includes('does the same'), 'no internal-message line in the bias step');
  assert.deepEqual(ev.steps.claims.map((i) => i.doc), ['email', 'emails', 'email', 'agreement']);
  assert.equal(ev.steps.claims[1].status, 'verified'); assert.equal(ev.steps.claims[3].status, 'verified');
});

await run('Copy evidence: action, verified quotes with file labels, rule; unverified quotes are left out', async () => {
  const docs = await fresh();
  docs.find((d) => d.role === 'invoice').masked = 'nothing here';
  const ev = resolveEvidence(evidence, docs);
  const t = evidenceText({ action: 'Approve $11,880.00 refund and corrected invoice', owner: 'Billing Manager', due: 'Fri 23 Oct', because: 'Accuracy: Invoice is $11,880.00 above the agreement.', items: ev.steps.approve, rule: 'H2.1 "An invoice must match the signed service agreement."', date: '19 October 2026' });
  assert.match(t, /Found in Agreement, page \d/); assert.match(t, /H2\.1/);
  assert.ok(!t.includes('Rush tier applied'), 'an unverified quote is never copied');
  assert.match(t, /a person makes the final decision/);
});

await run('7 audit counts hold step ids and numbers only, never quote text', async () => {
  const ev = resolveEvidence(evidence, await load());
  const a = auditCounts(ev);
  assert.equal(a.verified + a.notFound + a.notRead, 18, 'the 18 quotes in the seven steps; the callout is not a step');
  if (caseEmailText()) assert.equal(a.verified, 18);
  assert.equal(a.verified + a.notFound + a.notRead, quotes({ steps: evidence.steps, callouts: {} }).length);
  const s = JSON.stringify(a);
  for (const q of quotes(evidence)) assert.ok(!s.includes(q.text.slice(0, 20)), `audit contains "${q.text.slice(0, 20)}"`);
  assert.deepEqual(a.steps.map((x) => x.id), ['approve', 'privacy', 'refer', 'acknowledge', 'verify', 'bias', 'claims']);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
