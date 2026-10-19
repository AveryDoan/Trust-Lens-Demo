import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalise, findDemoEntry, cacheKey } from './demo.js';
import { scanPii } from './pii.js';
import { overallAction } from './rules.js';
import { validateReport } from './assess.js';

const entries = JSON.parse(readFileSync('demo-results.json', 'utf8'));
const email = (k) => readFileSync(`demo/emails/${k}.txt`, 'utf8').trim();
const EXPECT = { A: { action: 'escalate', pii: { email: 1, phone: 1 } }, B: { action: 'verify', pii: {} }, C: { action: 'approve', pii: {} } };
let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

for (const e of entries) {
  const text = email(e.id.toLowerCase());
  const { maskedText, findings } = scanPii(text);

  run(`${e.id}: report matches the schema`, () => { validateReport(JSON.parse(JSON.stringify(e.report))); });
  run(`${e.id}: every evidence quote is an exact substring of the email and of the masked text`, () => {
    let n = 0;
    for (const c of Object.values(e.report)) for (const q of c.evidence) {
      assert.ok(text.includes(q), `not in email: ${q}`);
      assert.ok(maskedText.includes(q), `not in masked text: ${q}`);
      n++;
    }
    assert.ok(n > 0 || e.id === 'B');
  });
  run(`${e.id}: matchPhrases are exact substrings of the email`, () => { for (const p of e.matchPhrases) assert.ok(text.includes(p), p); });
  run(`${e.id}: PII scan finds ${JSON.stringify(EXPECT[e.id].pii)}`, () => {
    const counts = {}; for (const f of findings) counts[f.type] = (counts[f.type] || 0) + 1;
    assert.deepEqual(counts, EXPECT[e.id].pii);
    for (const f of findings) assert.ok(!maskedText.includes(text.slice(f.start, f.end)));
  });
  run(`${e.id}: rules.js gives ${EXPECT[e.id].action}`, () => {
    const out = overallAction(e.report, findings);
    assert.equal(out.action, EXPECT[e.id].action);
    console.log(`        -> ${out.action}: ${out.label}. ${out.reason}`);
  });
  run(`${e.id}: matches its own email and no other`, () => {
    assert.equal(findDemoEntry(text, entries).id, e.id);
    for (const o of entries) if (o.id !== e.id) assert.notEqual(findDemoEntry(email(o.id.toLowerCase()), entries).id, e.id);
  });
}

run('A: policy and fact checks', () => {
  const a = entries[0].report;
  assert.equal(a.accuracy.claims.find((c) => c.label === 'contradicted').source, 'P5');
  assert.equal(a.governance.ai_use_allowed, false);
  assert.deepEqual(a.governance.policy_ids, ['P1', 'P2', 'P3', 'P4', 'P5']);
  assert.equal(entries[2].report.governance.classification, 'Public');
  assert.ok(entries[2].report.accuracy.claims.every((c) => c.label === 'supported' && c.source === 'P5'));
});

// Gmail-style text: quoted replies, signatures, odd whitespace, curly quotes, nbsp, shouting
const gmailish = `On Mon, 19 Oct 2026 at 9:14 AM Sam <sam@example.com> wrote:\n> old quoted line with customers under 25 are far more likely to commit fraud\n\n  It is   obvious... that CUSTOMERS UNDER 25 are far more likely to commit fraud than anyone.\n\n-- \nSam\nsignature with 14-day hold on every new account`;
run('normalise: quoted lines, "On ... wrote:", signature, whitespace, case, nbsp', () => {
  assert.equal(normalise(gmailish), 'it is obvious... that customers under 25 are far more likely to commit fraud than anyone.');
  assert.equal(normalise('  A \n\n B\t C '), 'a b c');
  assert.equal(normalise('don’t'), "don't");
  assert.equal(normalise(null), '');
});
run('findDemoEntry: Gmail-ish text matches A; phrase only in quote/signature does not', () => {
  assert.equal(findDemoEntry(gmailish, entries).id, 'A');
  assert.equal(findDemoEntry('> customers under 25 are far more likely to commit fraud\nhello', entries), null);
  assert.equal(findDemoEntry('hi\n-- \n14-day hold on every new account', entries), null);
  assert.equal(findDemoEntry('Totally unrelated text', entries), null);
  assert.equal(findDemoEntry('', entries), null);
});
const k1 = await cacheKey('Hello   World\n'), k2 = await cacheKey(' hello world'), k3 = await cacheKey('hello there');
run('cacheKey values', () => { assert.equal(k1, k2); assert.notEqual(k1, k3); assert.match(k1, /^[0-9a-f]{64}$/); });

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
