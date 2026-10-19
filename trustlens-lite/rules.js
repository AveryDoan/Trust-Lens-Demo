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

export function overallAction(report, piiFindings) {
  const claims = asArray(report?.accuracy?.claims).filter((c) => c && typeof c === 'object');
  const concerns = CHECKS.filter((name) => statusOf(report, name) === 'Concern').length;
  const classification = report?.governance?.classification;

  if (concerns >= 2) {
    return {
      action: 'escalate',
      label: 'Do not distribute until reviewed',
      reason: `Rule 1: ${concerns} checks show a concern, so a person should review this before it goes anywhere.`,
    };
  }
  if (isGroupBiasConcern(report)) {
    return {
      action: 'escalate',
      label: 'Do not distribute until reviewed',
      reason: 'Rule 1: the bias check shows a potential concern about a group of people, so a person should review this first.',
    };
  }
  if (asArray(piiFindings).length > 0) {
    return {
      action: 'redact',
      label: 'Redact personal information before sharing',
      reason: 'Rule 2: personal information was found in the text.',
    };
  }
  if (claims.some((c) => c.label === 'contradicted')) {
    return {
      action: 'revise',
      label: 'Revise before using',
      reason: 'Rule 3: at least one claim appears to be contradicted by the policy pack.',
    };
  }
  if (claims.some((c) => c.label === 'unverified')) {
    return {
      action: 'verify',
      label: 'Verify the source before relying on this',
      reason: 'Rule 4: at least one main claim could not be checked against the policy pack.',
    };
  }
  if (statusOf(report, 'deception') === 'Check' || statusOf(report, 'deception') === 'Concern') {
    return {
      action: 'verify',
      label: 'Verify the source before relying on this',
      reason: 'Rule 4: the deception check found signals worth checking. These are not proof of intent.',
    };
  }
  if (typeof classification === 'string' && classification.trim() && classification.trim().toLowerCase() !== 'public') {
    return {
      action: 'restrict',
      label: 'Share only with the right people',
      reason: `Rule 5: the text is classified above Public (${classification.trim()}).`,
    };
  }
  return { action: 'approve', label: 'OK to use', reason: 'Rule 6: no rule above fired.' };
}
