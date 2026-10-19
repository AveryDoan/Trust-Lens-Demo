import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalise, findDemoEntry, cacheKey } from './demo.js';
import { scanPii } from './pii.js';
import { overallAction } from './rules.js';
import { validateReport } from './assess.js';
import { knownIds, retentionFor, attachCitations } from './cite.js';
import { cleanText } from './extract.js';

const entries = JSON.parse(readFileSync('demo-results.json', 'utf8'));
// The text the checker sees: the file or email body after cleaning (whitespace collapsed, quotes and dashes straightened).
const textOf = (e) => cleanText(readFileSync(e.file, 'utf8'));
const EXPECT = {
  A: { action: 'escalate', pii: { email: 1, phone: 1 }, overall: ['C1', 'C2', 'C3', 'C4'], checks: { bias: ['CP1'], accuracy: ['C1', 'C5'], deception: [], governance: ['C2', 'C3', 'PR1', 'PR2'] }, status: ['Concern', 'Concern', 'Check', 'Check'] },
  B: { action: 'verify', pii: {}, overall: ['EC1', 'EC2', 'EC4'], checks: { bias: ['EC2'], accuracy: ['EC1'], deception: ['EC1'], governance: [] }, status: ['Check', 'Check', 'Concern', 'OK'] },
  C: { action: 'approve', pii: {}, overall: ['V1'], status: ['OK', 'OK', 'OK', 'OK'] },
  F1: { action: 'escalate', pii: { email: 1, phone: 1 }, overall: ['C1', 'C2', 'C3', 'C4'], checks: { bias: ['CP1'], accuracy: ['C1', 'C5'], deception: [], governance: ['C2', 'C3', 'PR1', 'PR2'] }, status: ['Concern', 'Concern', 'Check', 'Check'] },
  F2: { action: 'verify', pii: {}, overall: ['EC1', 'EC2', 'EC4'], checks: { bias: ['EC2'], accuracy: ['EC1'], deception: ['EC1'], governance: [] }, status: ['Check', 'Check', 'Concern', 'OK'] },
  F3: { action: 'approve', pii: {}, overall: ['V1'], status: ['OK', 'OK', 'OK', 'OK'] },
  F4: { action: 'revise', pii: {}, overall: ['PR4', 'PR5', 'PR3', 'V1'], checks: { accuracy: ['PR4', 'PR5', 'PR3', 'V1'], governance: ['PR5', 'PR3'] }, status: ['OK', 'Concern', 'Check', 'Check'] },
};
let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

for (const e of entries) {
  const text = textOf(e);
  const { maskedText, findings } = scanPii(text);
  const x = EXPECT[e.id];

  run(`${e.id}: report matches the schema and has the expected statuses`, () => {
    const v = validateReport(JSON.parse(JSON.stringify(e.report)));
    assert.deepEqual(['bias', 'accuracy', 'deception', 'governance'].map((k) => v[k].status), x.status);
    assert.equal(v.meta.dropped_ids, 0, 'saved report cites only known ids');
  });
  run(`${e.id}: every evidence quote is an exact substring of the email and of the masked text`, () => {
    for (const c of ['bias', 'accuracy', 'deception', 'governance'].map((k) => e.report[k])) for (const q of c.evidence) {
      assert.ok(text.includes(q), `not in email: ${q}`);
      assert.ok(maskedText.includes(q), `not in masked text: ${q}`);
    }
  });
  run(`${e.id}: matchPhrases are exact substrings of the email`, () => { for (const p of e.matchPhrases) assert.ok(text.toLowerCase().includes(p.toLowerCase()), p); });
  run(`${e.id}: PII scan finds ${JSON.stringify(x.pii)}`, () => {
    const counts = {}; for (const f of findings) counts[f.type] = (counts[f.type] || 0) + 1;
    assert.deepEqual(counts, x.pii);
    for (const f of findings) assert.ok(!maskedText.includes(text.slice(f.start, f.end)));
  });
  run(`${e.id}: rules.js gives ${x.action}`, () => {
    const out = overallAction(e.report, findings);
    assert.equal(out.action, x.action);
    console.log(`        -> ${out.action}: ${out.label}. ${out.reason} computed basis: ${out.basis.join(' ') || '(none)'}`);
  });
  run(`${e.id}: overall basis is ${x.overall.join(' ')} and every id exists`, () => {
    const out = overallAction(e.report, findings);
    const basis = e.overall?.basis ?? out.basis;
    assert.deepEqual(basis, x.overall);
    for (const id of basis) assert.ok(knownIds.has(id), id);
    if (e.overall) assert.ok(e.overall.step && /^[A-Z]/.test(e.overall.step));
  });
  if (x.checks) run(`${e.id}: per-check basis matches the brief`, () => {
    for (const [k, ids] of Object.entries(x.checks)) assert.deepEqual(e.report[k].basis, ids, k);
  });
  run(`${e.id}: no invented retention period; retention is set by code`, () => {
    assert.equal(e.report.governance.retention, retentionFor(e.report));
    // Our own wording must never state a period. Quotes and restated claims may repeat what the document says.
    const ours = [e.report.stamp_reason, e.report.governance.retention, ...['bias', 'accuracy', 'deception', 'governance'].flatMap((k) => [e.report[k].headline, e.report[k].summary, e.report[k].next_step])].join(' ');
    assert.ok(!/\b(\d+|one|two|three|four|five|six|seven|ten)[- ](years?|months?|days?)\b/i.test(ours), 'period in our wording');
  });
  run(`${e.id}: matches its own email and no other`, () => {
    assert.equal(findDemoEntry(text, entries, e.kind).id, e.id);
    for (const o of entries) if (o.id !== e.id) assert.notEqual(findDemoEntry(textOf(o), entries, o.kind)?.id, e.id);
  });
}

run('C: supported claims cite V1 and nothing else is flagged', () => {
  const c = entries[2].report;
  assert.ok(c.accuracy.claims.every((cl) => cl.label === 'supported' && cl.source === 'V1'));
  assert.equal(c.governance.classification, 'Public');
  assert.equal(c.governance.ai_use_allowed, true);
});
run('A: not for AI tools, and a Check or Concern with no basis is flagged as guidance only', () => {
  assert.equal(entries[0].report.governance.ai_use_allowed, false);
  const withCites = attachCitations(entries[0].report);
  assert.equal(withCites.deception.guidance_only, true);
  assert.equal(withCites.bias.guidance_only, false);
  assert.deepEqual(withCites.bias.citations.map((c) => c.id), ['CP1']);
});

const words = (s) => s.trim().split(/\s+/).length;
const VERBS = new Set(['Remove', 'Refer', 'Ask', 'Move', 'Avoid', 'Check', 'Keep', 'Link', 'Share', 'Correct', 'Stop']);
for (const e of entries) {
  run(`${e.id}: word budgets (headline 8, summary 20, next step 15, stamp reason 14, label 6) and no repeated hedge`, () => {
    const r = e.report;
    assert.ok(words(r.stamp_reason) <= 14, 'stamp_reason');
    for (const k of ['bias', 'accuracy', 'deception', 'governance']) {
      assert.ok(words(r[k].headline) <= 8, `${k} headline: ${r[k].headline}`);
      assert.ok(words(r[k].summary) <= 20, `${k} summary has ${words(r[k].summary)} words`);
      assert.ok(words(r[k].next_step) <= 15, `${k} next_step`);
      assert.ok(VERBS.has(r[k].next_step.split(' ')[0]), `${k} next_step starts with a verb`);
      assert.ok(!/potential concern/i.test(r[k].headline + r[k].summary), `${k} repeats the hedge`);
    }
    const o = overallAction(r, scanPii(textOf(e)).findings);
    assert.ok(words(o.label) <= 6 && words(o.reason) <= 14, `${o.label} / ${o.reason}`);
    if (e.overall) assert.ok(words(e.overall.step) <= 25);
  });
}

run('F1..F4: the saved action text and curated basis are present where the brief gives one', () => {
  const by = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(by.F1.overall.step, 'Stop circulating this. Move the notes to the secured case file and refer the matter to the CEO or Chair');
  assert.equal(by.F2.overall.step, 'Check who sent this. If the sender is a nominee, report it to the CEO');
  assert.ok(by.F4.overall.step.startsWith('Correct the policy claims before using this. Check the current Privacy Policy'));
  assert.equal(by.F3.overall, undefined);
  const f4 = by.F4.report.accuracy.claims;
  assert.deepEqual(f4.map((c) => [c.label, c.source]), [['contradicted', 'PR4'], ['unverified', ''], ['contradicted', 'V1'], ['contradicted', 'PR5']]);
});

// Typographic variants, as an exported PDF would produce: curly quotes, en/em dashes, non-breaking spaces, line breaks
const typographic = (s) => s.replace(/'/g, '\u2019').replace(/ - /g, ' \u2013 ').replace(/pack-up/g, 'pack\u2013up').replace(/ /g, (m, i) => (i % 7 === 0 ? '\u00A0' : ' ')).replace(/\. /g, '.\n');
run('typographic quotes and en dashes do not break matching or evidence quotes', () => {
  for (const e of entries.filter((x) => x.kind === 'file')) {
    const raw = readFileSync(e.file, 'utf8');
    const messy = typographic(raw);
    assert.notEqual(messy, raw);
    const cleaned = cleanText(messy);
    assert.equal(cleaned, cleanText(raw), `${e.id}: cleaning removes the typography`);
    assert.equal(findDemoEntry(cleaned, entries, 'file').id, e.id);
    for (const k of ['bias', 'accuracy', 'deception', 'governance']) for (const q of e.report[k].evidence) assert.ok(cleaned.includes(q), `${e.id}: ${q}`);
  }
  assert.ok(cleanText('Casey\u2019s \u201Cnotes\u201D \u2013 a \u2014 b').includes('Casey\'s "notes" - a - b'));
});

// Gmail-style text: quoted replies, signatures, odd whitespace, curly quotes, nbsp, shouting
const gmailish = `On Mon, 19 Oct 2026 at 9:14 AM Jess <jess@example.com> wrote:\n> old quoted line with Casey did it\n\n  CASEY   DID IT - there is no doubt.\n\n-- \nJess\nsignature with skip the investigation to save time`;
run('normalise: quoted lines, "On ... wrote:", signature, whitespace, case, nbsp', () => {
  assert.equal(normalise(gmailish), 'casey did it - there is no doubt.');
  assert.equal(normalise('  A \n\n B\t C '), 'a b c');
  assert.equal(normalise('don’t'), "don't");
  assert.equal(normalise(null), '');
});
run('findDemoEntry: Gmail-ish text matches A; phrase only in quote/signature does not', () => {
  assert.equal(findDemoEntry(gmailish, entries).id, 'A');
  assert.equal(findDemoEntry('> Casey did it\nhello', entries), null);
  assert.equal(findDemoEntry('hi\n-- \nskip the investigation to save time', entries), null);
  assert.equal(findDemoEntry('Totally unrelated text', entries), null);
  assert.equal(findDemoEntry('', entries), null);
});
const k1 = await cacheKey('Hello   World\n'), k2 = await cacheKey(' hello world'), k3 = await cacheKey('hello there');
run('cacheKey values', () => { assert.equal(k1, k2); assert.notEqual(k1, k3); assert.match(k1, /^[0-9a-f]{64}$/); });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
