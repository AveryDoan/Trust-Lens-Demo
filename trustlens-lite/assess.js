import { SYSTEM_PROMPT, buildUserPrompt, CLASSIFICATIONS, PII_TYPES } from './prompts.js';

const STATUSES = ['OK', 'Check', 'Concern'];
const CONFIDENCES = ['low', 'medium', 'high'];
const LABELS = ['supported', 'contradicted', 'unverified'];
const POLICY_ID = /^P\d+$/;
const TIMEOUT_MS = 30000;

// Newer Claude models reject non-default sampling parameters, so temperature is only sent to older ones.
const NO_SAMPLING_PARAMS = /claude-(?:fable|mythos|opus|sonnet|haiku)-5|claude-opus-4-[78]/;
const NEWER_MODEL = /claude-(?:fable|mythos|opus|sonnet|haiku)-5/;

export async function assess(maskedText, policyText, settings) {
  if (!settings?.apiKey) throw new Error('No API key set. Add one on the settings page.');
  const userPrompt = buildUserPrompt(maskedText, policyText);

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callModel(userPrompt, settings);
    try {
      const report = validateReport(parseJson(raw));
      const dropped = filterEvidence(report, maskedText);
      enforceRules(report);
      report.meta = { dropped_quotes: dropped, attempts: attempt };
      return report;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`The model did not return a valid report after 2 tries (${lastError.message}).`);
}

async function callModel(userPrompt, { endpoint, model, apiKey }) {
  const body = {
    model,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (!NO_SAMPLING_PARAMS.test(model)) body.temperature = 0.1;
  if (NEWER_MODEL.test(model)) body.output_config = { effort: 'low' }; // keeps replies fast

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? 'The request timed out.' : `Network error: ${err.message}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('The model declined this request.');
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function parseJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object found');
  return JSON.parse(raw.slice(start, end + 1));
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, name, { allowEmpty = false } = {}) => {
  if (typeof v !== 'string' || (!allowEmpty && !v.trim())) throw new Error(`${name} must be a${allowEmpty ? '' : ' non-empty'} string`);
  return v.trim();
};
const oneOf = (v, list, name) => {
  if (!list.includes(v)) throw new Error(`${name} must be one of ${list.join(', ')}`);
  return v;
};
const arr = (v, name) => {
  if (!Array.isArray(v)) throw new Error(`${name} must be an array`);
  return v;
};

function validateCheck(v, name) {
  if (!isObj(v)) throw new Error(`${name} missing`);
  return {
    status: oneOf(v.status, STATUSES, `${name}.status`),
    confidence: oneOf(v.confidence, CONFIDENCES, `${name}.confidence`),
    summary: str(v.summary, `${name}.summary`).slice(0, 300),
    evidence: arr(v.evidence, `${name}.evidence`).map((q) => str(q, `${name}.evidence item`)),
    next_step: str(v.next_step, `${name}.next_step`).slice(0, 200),
  };
}

export function validateReport(r) {
  if (!isObj(r)) throw new Error('report is not an object');
  const bias = validateCheck(r.bias, 'bias');

  const accuracy = validateCheck(r.accuracy, 'accuracy');
  accuracy.claims = arr(r.accuracy.claims, 'accuracy.claims').map((c) => {
    if (!isObj(c)) throw new Error('claim must be an object');
    return {
      claim: str(c.claim, 'claim'),
      label: oneOf(c.label, LABELS, 'claim.label'),
      source: str(c.source ?? '', 'claim.source', { allowEmpty: true }),
    };
  });

  const deception = validateCheck(r.deception, 'deception');
  deception.signals = arr(r.deception.signals, 'deception.signals').map((s) => str(s, 'signal'));

  const governance = validateCheck(r.governance, 'governance');
  const g = r.governance;
  governance.classification = oneOf(g.classification, CLASSIFICATIONS, 'governance.classification');
  governance.pii_types = arr(g.pii_types, 'governance.pii_types').map((t) => oneOf(t, PII_TYPES, 'pii_types item'));
  governance.retention = str(g.retention, 'governance.retention').slice(0, 200);
  if (typeof g.ai_use_allowed !== 'boolean') throw new Error('governance.ai_use_allowed must be boolean');
  governance.ai_use_allowed = g.ai_use_allowed;
  governance.policy_ids = arr(g.policy_ids, 'governance.policy_ids').map((p) => {
    if (typeof p !== 'string' || !POLICY_ID.test(p)) throw new Error('policy_ids items look like "P1"');
    return p;
  });

  return { bias, accuracy, deception, governance };
}

// Drops any quote that is not an exact substring of the input. Returns how many were dropped.
function filterEvidence(report, text) {
  let dropped = 0;
  for (const check of Object.values(report)) {
    const kept = check.evidence.filter((q) => text.includes(q));
    dropped += check.evidence.length - kept.length;
    check.evidence = kept.slice(0, 3);
  }
  return dropped;
}

// Code-side rules from SPEC: no quotes means low confidence; claims need a real policy source.
function enforceRules(report) {
  for (const check of Object.values(report)) {
    if (check.status !== 'OK' && check.evidence.length === 0) check.confidence = 'low';
  }
  for (const c of report.accuracy.claims) {
    if (c.label !== 'unverified' && !POLICY_ID.test(c.source)) c.label = 'unverified';
    if (c.label === 'unverified') c.source = '';
  }
}
