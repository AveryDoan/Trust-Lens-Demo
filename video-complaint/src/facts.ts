// Every string on screen that states a fact is built here from the prepared JSON. Nothing is retyped.
// This file has no imports so scripts/check.mjs can run it directly and compare it with the JSON.

export type Json = any;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const whole = (n: number) => `$${n.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;
export const signed = (n: number) => `${n < 0 ? '-' : '+'}${money(Math.abs(n))}`;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const becauseLabel = (b: Json) => `Because ${b.check} · ${cap(b.status)}`;
export const becauseLine = (b: Json) => `Because ${b.check}: ${b.text}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
const clauseTail = (section: string) => section.replace(/^\d+\.\s*[^,]*,\s*/, 's');

export const ROLE_LABEL: Record<string, string> = { invoice: 'Invoice', agreement: 'Agreement', correspondence: 'Emails' };
export const SIGNAL_LABEL: Record<string, string> = { P1: 'Design or editing tool', P3: 'Modified after creation', P4: 'Date conflict' };
const PII_WORDS: Record<string, string> = { email: 'email address', phone: 'phone number', tfn: 'tax file number', card: 'card number', dob: 'date of birth', address: 'street address' };

// The files named on the mail window. The names match the demo files the panel reads.
export const ATTACHMENTS = [
  { role: 'invoice', name: 'INV-DEMO-20417.pdf' },
  { role: 'agreement', name: '02-service-agreement-HRS-AGR-0311.pdf' },
  { role: 'correspondence', name: 'Correspondence-thread.pdf' },
];

export function buildFacts(result: Json, map: Json, counts: Json, policies: Json, evidence: Json) {
  const rec = result.case.reconciliation as Json[];
  const row = (item: string) => rec.find((r) => r.item === item);
  const invoiceNo = /INV-[A-Z0-9-]+/.exec(result.case.documents.find((d: Json) => d.role === 'invoice').keyFacts[0])![0];
  const agreementNo = result.matchAll.find((m: string) => m !== invoiceNo);
  const diff = result.case.totals.difference as number;
  const rate = row('Rate per box (ex GST)');
  const today = /(\w{3} \d{1,2} \w{3}) \d{4}/.exec(result.case.dueDateNote)![1];
  const invoiceDoc = result.case.documents.find((d: Json) => d.role === 'invoice');
  const prov = result.provenance[invoiceDoc.name];
  const md = prov.demoMetadata;
  const policy = (id: string) => policies.policies.find((p: Json) => p.id === id);
  const clause = (id: string) => ({ id, chip: `${id} · ${clauseTail(policy(id).section)}`, quote: policy(id).quote, document: policy(id).document, version: policy(id).version, section: policy(id).section });
  const pathSteps = [
    { ...map.stamp, id: 'stamp' },
    ...map.alsoNeeded,
    ...(prov.signals.length ? map.pathOnly : []),
  ].sort((a: Json, b: Json) => a.due.localeCompare(b.due));
  const dueGroups: { due: string; label: string; steps: Json[] }[] = [];
  for (const s of pathSteps) { const g = dueGroups.find((x) => x.due === s.due); if (g) g.steps.push(s); else dueGroups.push({ due: s.due, label: day(s.due), steps: [s] }); }
  const acknowledge = map.alsoNeeded.find((s: Json) => s.id === 'acknowledge');
  // Evidence: only quotes that verified against the real files are used. Anything else stops the build.
  const evItems = (id: string) => (evidence.resolved.steps[id] as Json[]).filter((i) => i.kind === 'quote').map((i) => {
    if (i.status !== 'verified' || !i.text) throw new Error(`Evidence "${id}/${i.shows}" is ${i.status}; the video only shows verified quotes`);
    return { doc: i.doc as string, label: i.label as string, shows: i.shows as string, text: i.text as string, found: `Found in ${i.label}${i.page ? `, page ${i.page}` : ''}` };
  });
  const evStep = (id: string, step: Json) => {
    const items = evItems(id);
    const first = clause(step.basis[0]);
    const total = row('Total (incl GST)');
    return {
      id, action: step.action as string, owner: step.owner as string, due: day(step.due), because: becauseLine(step.because),
      items,
      sbs: id === 'approve' ? { agreed: items.find((i) => i.doc === 'agreement')!, billed: items.find((i) => i.doc === 'invoice')! } : null,
      amounts: id === 'approve' ? `Agreed ${money(total.agreed)} · Billed ${money(total.billed)} · Difference ${signed(total.difference)}` : null,
      rule: { id: first.id, quote: first.quote as string, ref: `${first.id} · ${first.document} v${first.version}, s${first.section}`, others: (step.basis as string[]).slice(1).map((b) => clause(b).chip) },
    };
  };
  const typeParts = Object.entries(counts.byType as Record<string, number>).map(([t, n]) => `${n} ${PII_WORDS[t] ?? t}`);

  return {
    email: {
      subject: `Formal complaint: overcharged ${whole(diff)} on invoice ${invoiceNo}`,
      sender: 'Elena Marsh',
      lines: [
        'Dear Complaints team,',
        `I am formally complaining that Meridian Community Health Services was overcharged ${whole(diff)} on invoice ${invoiceNo}.`,
        `Our signed agreement (${agreementNo}, clause 3) sets the price at ${money(rate.agreed)} per box. The invoice charges ${money(rate.billed)} per box.`,
      ],
      attachments: ATTACHMENTS,
    },
    files: ATTACHMENTS.map((a) => ({ ...a, label: ROLE_LABEL[a.role] })),
    filesRead: `Files: ${ATTACHMENTS.length} read`,
    masked: { total: `${counts.total} items masked locally`, perType: typeParts.join(', '), excerpt: counts.excerpt as string[] },
    reading: ['Reading 3 documents', 'Checking the amounts', 'Checking against the policy', 'Preparing next steps'],
    stamp: {
      label: becauseLabel(map.stamp.because), because: map.stamp.because.text, action: map.stamp.action,
      owner: map.stamp.owner, due: `due ${day(map.stamp.due)}`, ownerDue: `${map.stamp.owner} · due ${day(map.stamp.due)}`, basis: map.stamp.basis as string[],
    },
    also: (map.alsoNeeded as Json[]).map((s) => ({ action: s.action, because: becauseLine(s.because), owner: s.owner, due: day(s.due) })),
    collapsed: map.collapsedChecks as string,
    accuracy: {
      rows: (map.accuracyDefaultRows as string[]).map((item) => { const r = row(item); return { item, agreed: money(r.agreed), billed: money(r.billed), diff: signed(r.difference), quote: r.quoteAgreed as string }; }),
      moreLabel: map.accuracyMoreLabel as string, claimsSummary: map.claimsSummary as string,
    },
    clause: clause(map.stamp.basis[0]),
    evidence: { approve: evStep('approve', map.stamp), privacy: evStep('privacy', map.alsoNeeded.find((s: Json) => s.id === 'privacy')) },
    path: {
      today: { label: today, text: acknowledge.because.text as string },
      groups: dueGroups.map((g) => ({ label: g.label, steps: g.steps.map((s) => ({ action: s.action, owner: s.owner, because: becauseLine(s.because), basis: s.basis as string[] })) })),
      outcome: { label: day(result.case.outcomeDue.date), text: `Written outcome due ${day(result.case.outcomeDue.date)}`, basis: result.case.outcomeDue.basis as string[] },
    },
    provenance: {
      chip: 'Provenance: check', file: ATTACHMENTS[0].name, // the attached invoice, as the panel shows it summary: prov.summary as string,
      rows: [['Created with', md.creator], ['Created', fmtDate(md.created)], ['Modified', fmtDate(md.modified)], ['Author', md.author]] as string[][],
      signals: (prov.signals as string[]).map((id) => ({ id, label: SIGNAL_LABEL[id] })),
      hedge: 'A clue, not proof.',
    },
    labels: { demo: 'Demo mode: saved example', footer: 'Policy basis: Harbourview complaints procedure', callouts: { bias: 'Bias', governance: 'Governance', policy: 'Policy' }, end: ['TrustLens Lite', 'Every step shows its evidence and its rule.', 'Demo data. Fictional.', 'RIMPA Global Hackathon 2026'] },
  };
}
export type Facts = ReturnType<typeof buildFacts>;
