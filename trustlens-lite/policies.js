import rimpa from './policies.json' with { type: 'json' };
import harbourview from './policies-harbourview.json' with { type: 'json' };

// The organisation profile picks the pack. Quotes always come from the active pack's JSON, never from the model.
export const PACKS = {
  rimpa: {
    id: 'rimpa',
    label: 'RIMPA Global (governance documents)',
    footer: 'Policy basis: RIMPA Global published governance documents',
    short: 'RIMPA Global governance documents',
    citePrefix: 'RIMPA Global ',
    forbidsExternalAi: false,
    retention: 'Per RIMPA disposal authority or NAA records authority.',
    data: rimpa,
  },
  harbourview: {
    id: 'harbourview',
    label: 'Harbourview Records Services (complaints)',
    footer: 'Policy basis: Harbourview complaints procedure (fictional demo)',
    short: 'Harbourview complaints procedure',
    citePrefix: '',
    forbidsExternalAi: true, // H4.3: personal information is never entered into external AI tools
    retention: 'Kept in the case file and disposed of under the records disposal authority (H5.1).',
    data: harbourview,
  },
};

export let activePackId = 'rimpa';
export let policies = PACKS.rimpa.data.policies;
export const activePack = () => PACKS[activePackId];

export function setPack(id) {
  activePackId = PACKS[id] ? id : 'rimpa';
  policies = PACKS[activePackId].data.policies;
  return activePack();
}

// Compact text version of the active pack for the model prompt.
export function policiesForPrompt() {
  const pack = activePack();
  const lines = [`POLICY PACK: ${pack.label}. Cite only these ids.`];
  for (const p of policies) {
    const where = p.version === 'see parts' ? p.document : `${p.document} v${p.version}, s${p.section}`;
    const quote = p.parts || p.quote === 'No provision found' ? '' : ` Quote: "${p.quote}"`;
    lines.push(`${p.id} (${where}).${quote} Rule: ${p.rule}`);
  }
  return lines.join('\n');
}
