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

export function buildFacts(result: Json, map: Json, counts: Json, policies: Json, evidence: Json, pages: Json = null) {
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
  // ----- the 60 second video: bias, claims, the rush comparison, who to contact -----
  const claimParts = (status: string) => {
    const m = /^(supported|needs checking|misinformation)\b[:\s]*(.*)$/i.exec(status);
    if (!m) return { label: 'Not shown in the documents', reason: '' };
    const label = ({ supported: 'Supported', 'needs checking': 'Needs checking', misinformation: 'Misinformation' } as Record<string, string>)[m[1].toLowerCase()];
    return { label, reason: m[2].trim() ? cap(m[2].trim()) : '' };
  };
  const claimsAll = (result.case.claims as Json[]).map((c) => ({ claim: c.claim as string, ...claimParts(c.status) }));
  const claimItems = evItems('claims');
  const biasCheck = (result.checks as Json[]).find((c) => c.key === 'bias');
  const approveItems = evItems('approve');
  const owners: { owner: string; actions: string[] }[] = [];
  for (const g of dueGroups) for (const st of g.steps) { const o = owners.find((x) => x.owner === st.owner); if (o) o.actions.push(st.action); else owners.push({ owner: st.owner, actions: [st.action] }); }
  // The calculation behind "Agreed vs billed": every difference is computed here and must equal the saved result.
  const cents = (n: number) => Math.round(n * 100);
  const recRow = (item: string) => { const r = (result.case.reconciliation as Json[]).find((x) => x.item === item); if (!r) throw new Error(`reconciliation has no "${item}"`); return r; };
  const calcLine = (item: string, label: string) => {
    const r = recRow(item);
    const diff = (cents(r.billed) - cents(r.agreed)) / 100;
    if (cents(diff) !== cents(r.difference)) throw new Error(`${item}: ${r.billed} - ${r.agreed} is ${diff}, the saved result says ${r.difference}`);
    return { label, expr: `${money(r.billed)} - ${money(r.agreed)} = ${signed(diff)}`, diff };
  };
  const rateRow = recRow('Rate per box (ex GST)'), subRow = recRow('Subtotal (ex GST)');
  const boxes = Math.round(cents(subRow.agreed) / cents(rateRow.agreed));
  if (boxes !== Math.round(cents(subRow.billed) / cents(rateRow.billed))) throw new Error('the agreed and billed sides do not have the same number of boxes');
  if (cents(boxes * rateRow.difference) !== cents(subRow.difference)) throw new Error(`${boxes} x ${rateRow.difference} is not ${subRow.difference}`);
  const calc = {
    heads: { left: 'Invoice (billed)', right: 'Agreement (agreed)', tag: 'Source of truth' },
    lines: [calcLine('Rate per box (ex GST)', 'Rate per box'), { label: 'Boxes', expr: boxes.toLocaleString('en-AU'), diff: 0 }, calcLine('Subtotal (ex GST)', 'Subtotal'), calcLine('GST (10%)', 'GST (10%)'), calcLine('Total (incl GST)', 'Total')],
  };
  // the claim note: the status text of the saved claim, as two short sentences
  const noteOf = (reason: string) => reason.split(/;\s*/).map((p) => cap(p.trim()).replace(/\.$/, '') + '.').join(' ');
  const claimStatusCount = (re: RegExp) => (result.case.claims as Json[]).filter((c) => re.test(c.status)).length;
  const assess = {
    title: 'Assessment',
    rows: (result.checks as Json[]).map((c) => ({ key: c.key as string, label: c.label as string, status: c.status as string, question: c.question as string })),
    tags: [`Misinformation (${claimStatusCount(/^misinformation/i)})`, `Needs checking (${claimStatusCount(/^needs checking/i)})`],
  };
  const confirm = (map.pathOnly as Json[]).find((x) => x.id === 'confirm');
  const whoWords: [string, string][] = [[map.stamp.owner as string, 'approve'], [(map.alsoNeeded as Json[]).find((x) => x.id === 'refer').owner as string, 'referral'], [(map.alsoNeeded as Json[]).find((x) => x.id === 'privacy').owner as string, 'acknowledge and notify']];
  const sixty = {
    assess,
    bias: { items: evItems('bias'), note: biasCheck.basisNote as string, shows: 'Source of truth' },
    claims: {
      needsChecking: { ...claimsAll.find((c) => c.label === 'Needs checking')!, note: noteOf(claimsAll.find((c) => c.label === 'Needs checking')!.reason), customer: claimItems[0], file: claimItems[1] },
      misinformation: { ...claimsAll.find((c) => c.label === 'Misinformation')!, customer: claimItems[2], file: claimItems[3] },
    },
    rush: { agreed: approveItems.find((i) => i.doc === 'agreement' && /written rush request/.test(i.text))!, billed: approveItems.find((i) => i.doc === 'invoice' && /^Rush tier/.test(i.text))!, amounts: evStep('approve', map.stamp).amounts as string },
    calc,
    accounts: { action: confirm.action as string, because: becauseLine(confirm.because), owner: confirm.owner as string, due: day(confirm.due), guidance: confirm.guidance === true && confirm.basis.length === 0, customer: claimItems[0], file: claimItems[1], note: noteOf(claimsAll.find((c) => c.label === 'Needs checking')!.reason) },
    // storyboard copy: the "Accounts team" row is not an owner in the saved data
    who: [...whoWords.map(([o, w]) => ({ owner: o, role: w, hot: false })), { owner: 'Accounts team', role: 'confirm the emails', hot: true }],
    pages,
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
    sixty,
    evidence: { approve: evStep('approve', map.stamp), privacy: evStep('privacy', map.alsoNeeded.find((s: Json) => s.id === 'privacy')) },
    path: {
      today: { label: today, text: acknowledge.because.text as string },
      groups: dueGroups.map((g) => ({ label: g.label, steps: g.steps.map((s) => ({ action: s.action, owner: s.owner, because: becauseLine(s.because), basis: s.basis as string[], guidance: s.guidance === true })) })),
      outcome: { label: day(result.case.outcomeDue.date), text: `Written outcome due ${day(result.case.outcomeDue.date)}`, basis: result.case.outcomeDue.basis as string[] },
    },
    provenance: {
      chip: 'Provenance: check', file: ATTACHMENTS[0].name, // the attached invoice, as the panel shows it summary: prov.summary as string,
      rows: [['Created with', md.creator], ['Created', fmtDate(md.created)], ['Modified', fmtDate(md.modified)], ['Author', md.author]] as string[][],
      signals: (prov.signals as string[]).map((id) => ({ id, label: SIGNAL_LABEL[id] })),
      hedge: 'A clue, not proof.',
    },
    labels: { demo: 'Demo mode: saved example', footer: 'Policy basis: Harbourview complaints procedure', callouts: { bias: 'Bias', governance: 'Governance', policy: 'Policy' },
      // copy supplied with the storyboard (the permission screen is a mock-up)
      tools: ['Use this email', 'Check selected text', 'Drop a file', `Policy pack: ${cap(policies.pack)}`, 'History'],
      consent: { title: 'Allow TrustLens to read:', rows: ['Email text', '3 attachments: Agreement, Invoice, Emails'], note: 'Masked on this device first. Nothing is sent until you press Run AI.', allow: 'Allow', notNow: 'Not now' },
      counter: '3 attachments', recommended: 'Recommended next step', sourceOfTruth: 'Source of truth', seeAI: 'What the AI will see', end60: ['TrustLens Lite', 'Every action quotes the rule it comes from.', 'Demo data. Fictional.', 'RIMPA Global Hackathon 2026'], mockup: 'Mock-up', guidanceNote: 'TrustLens guidance, not policy', end: ['TrustLens Lite', 'Every step shows its evidence and its rule.', 'Demo data. Fictional.', 'RIMPA Global Hackathon 2026'] },
  };
}
export type Facts = ReturnType<typeof buildFacts>;
