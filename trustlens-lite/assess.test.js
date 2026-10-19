// Offline tests use a mocked fetch. Run `node assess.test.js --live` to make one real call (needs ANTHROPIC_API_KEY).
import assert from 'node:assert/strict';
import { assess } from './assess.js';
import { scanPii } from './pii.js';
import { policiesForPrompt } from './policies.js';
import { attachCitations } from './cite.js';

const TEXT = 'Our analysis shows that customers from Group X commit far more fraud than everyone else. Everyone knows it.';
const settings = { endpoint: 'https://example.test/v1/messages', model: 'claude-sonnet-5-5', apiKey: 'k' };

const check = (over = {}) => ({ status: 'OK', confidence: 'high', summary: 'Fine.', evidence: [], next_step: 'Keep as is.', ...over });
const good = () => ({
  bias: check({ status: 'Concern', confidence: 'high', evidence: ['customers from Group X commit far more fraud', 'not in the text'], basis: ['CP1'] }),
  accuracy: check({ status: 'Concern', evidence: ['commit far more fraud'], basis: ['C1', 'ZZ9'], claims: [
    { claim: 'Group X commits more fraud', label: 'contradicted', source: 'C1' },
    { claim: 'Everyone knows it', label: 'supported', source: 'made up' } ] }),
  deception: check({ status: 'Check', evidence: ['Everyone knows it'], signals: ['appeal to common belief'] }),
  governance: check({ classification: 'Internal', pii_types: [], retention: 'Keep it for 7 years', ai_use_allowed: true, basis: ['C3'] }),
});
const reply = (text) => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });

const realFetch = globalThis.fetch;
let calls = [];
const mock = (...texts) => { calls = []; globalThis.fetch = async (url, init) => { calls.push(JSON.parse(init.body)); return reply(texts[Math.min(calls.length - 1, texts.length - 1)]); }; };

if (process.argv.includes('--live')) {
  globalThis.fetch = realFetch;
  const { readFileSync } = await import('node:fs');
  const text = readFileSync('demo/emails/a.txt', 'utf8').trim();
  const { maskedText } = scanPii(text);
  const t0 = Date.now();
  const r = await assess(maskedText, policiesForPrompt(), { ...settings, endpoint: 'https://api.anthropic.com/v1/messages', apiKey: process.env.ANTHROPIC_API_KEY });
  const secs = (Date.now() - t0) / 1000;
  console.log(JSON.stringify(r, null, 2), `\n${secs.toFixed(1)}s`);
  for (const k of ['bias', 'accuracy', 'deception', 'governance']) for (const q of r[k].evidence) assert.ok(maskedText.includes(q));
  assert.ok(!/\d+ years?/.test(r.governance.retention));
  console.log('live acceptance ok (check the statuses and basis ids by eye)');
  process.exit(0);
}

try {
  mock('```json\n' + JSON.stringify(good()) + '\n```');
  let r = await assess(TEXT, 'POLICIES', settings);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].temperature, undefined, 'no temperature for Sonnet 5.5');
  assert.deepEqual(r.bias.evidence, ['customers from Group X commit far more fraud']);
  assert.equal(r.meta.dropped_quotes, 1);
  assert.equal(r.accuracy.claims[0].label, 'contradicted');
  assert.equal(r.accuracy.claims[0].source, 'C1');
  assert.equal(r.accuracy.claims[1].label, 'unverified'); // bad source downgraded
  console.log('ok    valid report, fences stripped, quote dropped, claim downgraded');

  // invented policy ids are dropped; real ones kept
  assert.deepEqual(r.accuracy.basis, ['C1']);
  assert.equal(r.meta.dropped_ids, 1);
  console.log('ok    invented policy id ZZ9 dropped');

  // the model's retention wording is never used; the policies give no fixed period
  assert.ok(!/7 years/.test(r.governance.retention) && /RIMPA disposal authority/.test(r.governance.retention));
  console.log('ok    invented retention period replaced by the policy wording');

  // quotes come from policies.json only: fields the model adds are discarded, and citations are looked up in code
  const sneaky = good();
  sneaky.bias.quote = 'Totally invented RIMPA policy text'; sneaky.bias.citations = [{ id: 'C1', quote: 'FAKE' }];
  mock(JSON.stringify(sneaky));
  const rs = await assess(TEXT, 'P', settings);
  assert.ok(!JSON.stringify(rs).includes('invented RIMPA') && !JSON.stringify(rs).includes('FAKE'));
  const shown = attachCitations(rs);
  const pack = (await import('node:fs')).readFileSync('policies.json', 'utf8');
  for (const k of ['bias', 'accuracy', 'governance']) for (const c of shown[k].citations) assert.ok(pack.includes(JSON.stringify(c.quote).slice(1, -1)), 'quote is from policies.json');
  assert.deepEqual(shown.bias.citations.map((c) => c.id), ['CP1']);
  console.log('ok    every displayed quote comes from policies.json, none from the model');

  // a Check or Concern with no valid basis is flagged as guidance only
  const noBasis = good(); noBasis.bias.basis = ['ZZ9'];
  mock(JSON.stringify(noBasis));
  const rn = attachCitations(await assess(TEXT, 'P', settings));
  assert.equal(rn.bias.guidance_only, true);
  assert.equal(rn.accuracy.guidance_only, false);
  console.log('ok    no valid basis means guidance only');

  mock('not json at all', JSON.stringify(good()));
  r = await assess(TEXT, 'P', settings);
  assert.equal(calls.length, 2);
  assert.equal(r.meta.attempts, 2);
  console.log('ok    retries once on invalid JSON');

  const bad = good(); bad.bias.status = 'Terrible';
  mock(JSON.stringify(bad));
  await assert.rejects(assess(TEXT, 'P', settings), /2 tries/);
  assert.equal(calls.length, 2);
  console.log('ok    gives up after one retry');

  mock(JSON.stringify(good()));
  await assess(TEXT, 'P', { ...settings, model: 'claude-3-5-haiku-latest' });
  assert.equal(calls[0].temperature, 0.1);
  console.log('ok    temperature sent to older models');

  const noQuote = good(); noQuote.bias.evidence = ['nope'];
  mock(JSON.stringify(noQuote));
  r = await assess(TEXT, 'P', settings);
  assert.equal(r.bias.confidence, 'low');
  console.log('ok    no surviving quotes caps confidence at low');

  await assert.rejects(assess(TEXT, 'P', { ...settings, apiKey: '' }), /API key/);
  console.log('ok    missing key');
  console.log('\nall passed');
} finally {
  globalThis.fetch = realFetch;
}
