// Maps a validated report plus local PII findings to one overall action. Pure code, no model involved.

const GROUP_WORDS =
  /\b(group|groups|community|communities|people|customers? (?:from|of)|ethnic\w*|race|racial|religio\w*|gender|women|men|age|aged|elderly|migrants?|immigrants?|nationalit\w*|indigenous|disabilit\w*|minorit\w*|demographic\w*)\b/i;

const CHECKS = ['bias', 'accuracy', 'deception', 'governance'];

const asArray = (v) => (Array.isArray(v) ? v : []);
const statusOf = (report, name) => report?.[name]?.status;

function isGroupBiasConcern(report) {
  const bias = report?.bias;
  if (bias?.status !== 'Concern') return false;
  const text = [bias.summary, ...asArray(bias.evidence)].filter((s) => typeof s === 'string').join(' ');
  return GROUP_WORDS.test(text);
}

// Union of cited policy ids, in the order given. Missing or odd basis values are ignored.
const basisOf = (report, names) => [...new Set(names.flatMap((n) => asArray(report?.[n]?.basis).filter((id) => typeof id === 'string')))];
const stepOf = (report, names) => names.map((n) => report?.[n]?.next_step).find((s) => typeof s === 'string' && s.trim()) ?? null;

// Returns { action, label, reason, basis, step }. basis is the union of the policy ids cited by the checks
// that triggered the rule, in check order. step is the next step of the first of those checks.
export function overallAction(report, piiFindings) {
  const claims = asArray(report?.accuracy?.claims).filter((c) => c && typeof c === 'object');
  const concernNames = CHECKS.filter((name) => statusOf(report, name) === 'Concern');
  const classification = report?.governance?.classification;
  const make = (action, label, reason, names, extraIds = []) => ({
    action, label, reason,
    basis: [...new Set([...basisOf(report, names), ...extraIds])],
    step: stepOf(report, names),
  });

  if (concernNames.length >= 2) {
    return make('escalate', 'Do not distribute until reviewed',
      `Rule 1: ${concernNames.length} checks show a concern. A person should review it.`, concernNames);
  }
  if (isGroupBiasConcern(report)) {
    return make('escalate', 'Do not distribute until reviewed',
      'Rule 1: the bias check shows a concern about a group of people.', ['bias']);
  }
  if (asArray(piiFindings).length > 0) {
    return make('redact', 'Redact personal information before sharing', 'Rule 2: personal information was found in the text.', ['governance']);
  }
  const contradicted = claims.filter((c) => c.label === 'contradicted');
  if (contradicted.length) {
    return make('revise', 'Revise before using', 'Rule 3: a claim appears to be contradicted by a policy.', ['accuracy'],
      contradicted.map((c) => c.source).filter((id) => typeof id === 'string' && id));
  }
  if (claims.some((c) => c.label === 'unverified')) {
    return make('verify', 'Verify the source first', 'Rule 4: a main claim could not be checked against a policy.',
      ['accuracy', ...(['Check', 'Concern'].includes(statusOf(report, 'deception')) ? ['deception'] : [])]);
  }
  if (statusOf(report, 'deception') === 'Check' || statusOf(report, 'deception') === 'Concern') {
    return make('verify', 'Verify the source first', 'Rule 4: the deception check found signals worth checking.', ['deception']);
  }
  if (typeof classification === 'string' && classification.trim() && classification.trim().toLowerCase() !== 'public') {
    return make('restrict', 'Share only with the right people', `Rule 5: the text is classified above Public (${classification.trim()}).`, ['governance']);
  }
  return { ...make('approve', 'OK to use', 'Rule 6: no rule above fired.', CHECKS), step: null };
}
