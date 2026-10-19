import pack from './policies.json' with { type: 'json' };

export const policies = pack.policies;

// Compact text version of the pack for the model prompt.
export function policiesForPrompt() {
  const lines = ['POLICY PACK: RIMPA Global published governance documents. Cite only these ids.'];
  for (const p of pack.policies) {
    const where = p.version === 'see parts' ? p.document : `${p.document} v${p.version}, s${p.section}`;
    const quote = p.id === 'V1' || p.id === 'PR3' ? '' : ` Quote: "${p.quote}"`;
    lines.push(`${p.id} (${where}).${quote} Rule: ${p.rule}`);
  }
  return lines.join('\n');
}
