import pack from './policies.json' with { type: 'json' };

export const policies = pack.policies;

// Compact text version of the pack for the model prompt.
export function policiesForPrompt() {
  const lines = [`POLICY PACK (${pack.note})`];
  for (const p of pack.policies) {
    lines.push(`${p.id} ${p.title}: ${p.text}`, `Rule: ${p.rule}`);
  }
  return lines.join('\n');
}
