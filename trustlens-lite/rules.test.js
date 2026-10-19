import assert from 'node:assert/strict';
import { overallAction } from './rules.js';

const check = (over = {}) => ({ status: 'OK', confidence: 'high', summary: 'Fine.', evidence: [], next_step: 'Keep.', ...over });
const clean = () => ({
  bias: check(),
  accuracy: check({ claims: [{ claim: 'A', label: 'supported', source: 'P5' }] }),
  deception: check({ signals: [] }),
  governance: check({ classification: 'Public', pii_types: [], retention: 'x', ai_use_allowed: true, policy_ids: [] }),
});
const PII = [{ type: 'email', start: 0, end: 5 }];

const cases = [
  ['rule 1: two concerns', () => { const r = clean(); r.accuracy.status = 'Concern'; r.deception.status = 'Concern'; return [r, [], 'escalate']; }],
  ['rule 1: bias concern about a group', () => { const r = clean(); r.bias = check({ status: 'Concern', summary: 'Potential concern: blames one customer group.' }); return [r, [], 'escalate']; }],
  ['rule 1 not triggered: bias concern with no group, nothing else', () => { const r = clean(); r.bias = check({ status: 'Concern', summary: 'Potential concern: one-sided tone.' }); return [r, [], 'approve']; }],
  ['rule 2: PII findings', () => [clean(), PII, 'redact']],
  ['rule 3: contradicted claim', () => { const r = clean(); r.accuracy.claims = [{ claim: 'B', label: 'contradicted', source: 'P5' }]; return [r, [], 'revise']; }],
  ['rule 4: unverified claim', () => { const r = clean(); r.accuracy.claims = [{ claim: 'C', label: 'unverified', source: '' }]; return [r, [], 'verify']; }],
  ['rule 4: deception Check', () => { const r = clean(); r.deception.status = 'Check'; return [r, [], 'verify']; }],
  ['rule 4: deception Concern alone', () => { const r = clean(); r.deception.status = 'Concern'; return [r, [], 'verify']; }],
  ['rule 5: classification above Public', () => { const r = clean(); r.governance.classification = 'Internal'; return [r, [], 'restrict']; }],
  ['rule 6: approve', () => [clean(), [], 'approve']],
  // tie-breaks: when several rules match, the earliest wins
  ['tie-break: PII + contradicted + Internal -> redact', () => { const r = clean(); r.accuracy.claims = [{ claim: 'B', label: 'contradicted', source: 'P5' }]; r.governance.classification = 'Internal'; return [r, PII, 'redact']; }],
  ['tie-break: two concerns + PII -> escalate', () => { const r = clean(); r.accuracy.status = 'Concern'; r.deception.status = 'Concern'; return [r, PII, 'escalate']; }],
  ['tie-break: contradicted + deception Check -> revise', () => { const r = clean(); r.accuracy.claims = [{ claim: 'B', label: 'contradicted', source: 'P5' }]; r.deception.status = 'Check'; return [r, [], 'revise']; }],
  ['tie-break: unverified + Confidential -> verify', () => { const r = clean(); r.accuracy.claims = [{ claim: 'C', label: 'unverified', source: '' }]; r.governance.classification = 'Confidential'; return [r, [], 'verify']; }],
];

const LABELS = {
  escalate: 'Do not distribute until reviewed',
  redact: 'Redact personal information before sharing',
  revise: 'Revise before using',
  verify: 'Verify the source before relying on this',
  restrict: 'Share only with the right people',
  approve: 'OK to use',
};

let failed = 0;
const run = (name, fn) => {
  try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); }
};

for (const [name, build] of cases) {
  run(name, () => {
    const [report, pii, expected] = build();
    const out = overallAction(report, pii);
    assert.equal(out.action, expected);
    assert.equal(out.label, LABELS[expected]);
    assert.match(out.reason, /^Rule \d: .+\.$/);
  });
}

run('never throws on missing or odd input', () => {
  const inputs = [undefined, null, {}, [], 'x', 42, { bias: null }, { accuracy: { claims: null } }, { accuracy: { claims: [null, 'x', {}] } },
    { governance: { classification: 5 } }, { bias: { status: 'Concern' } }, { bias: { status: 'Concern', evidence: [1, null] } }];
  for (const r of inputs) for (const p of [undefined, null, 'x', [], {}]) {
    const out = overallAction(r, p);
    assert.ok(out.action && out.label && out.reason);
  }
  assert.equal(overallAction({}, undefined).action, 'approve');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
