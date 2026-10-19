// Case bundles: several documents plus the open email. Roles by content, saved-result matching, and every
// calculation (sums, GST, differences, due dates) done in code, never by the model.
import { cleanText } from './extract.js';
import { provenanceSignals, provenanceSummary, printedDate } from './provenance.js';

export const ROLE_LABELS = { invoice: 'Invoice', agreement: 'Agreement', correspondence: 'Emails', policy: 'Policy', email: 'Email', other: 'Other' };
export const PRIMARY_DUE_WEEKDAYS = 4; // demo default for the refund decision: before the 10-day written outcome

// ---------- roles, by content (never by file name) ----------
const count = (re, s) => (s.match(re) || []).length;
export function detectRole(text) {
  const t = String(text ?? '');
  // The organisation's own procedure is a policy source, never the signed agreement it refers to.
  if (/Customer Complaints, Billing and Privacy Procedure/i.test(t)) return { role: 'policy', confidence: 0.98, score: {} };
  const score = {
    invoice: 3 * count(/\btax invoice\b/gi, t) + 2 * count(/\binvoice (?:number|date|no)\b/gi, t) + count(/\bsubtotal\b/gi, t) + count(/\bGST\b/g, t) + count(/\b(?:total due|amount due)\b/gi, t),
    agreement: 3 * count(/\bservice agreement\b/gi, t) + 2 * Math.min(3, count(/\bclause\s*\d/gi, t)) + count(/\bparties\b/gi, t) + count(/\bthe customer\b/gi, t) + count(/\bsigned\b/gi, t),
    correspondence: 2 * count(/^\s*From:/gim, t) + count(/^\s*Subject:/gim, t) + count(/^\s*To:/gim, t) + 2 * count(/\bemail thread\b/gi, t),
  };
  // Extracted PDF text is one line, so also look for the labels mid-text.
  score.correspondence += 2 * count(/\bFrom: [A-Z][^:]{2,40}?(?:@|\s[a-z]+@)/g, t);
  const [role, best] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best < 3) return { role: 'other', confidence: 0.5, score };
  const second = Object.values(score).sort((a, b) => b - a)[1];
  return { role, confidence: Math.round(Math.min(0.99, 0.7 + (best - second) * 0.03) * 100) / 100, score };
}

// ---------- saved results ----------
const squash = (s) => cleanText(s).toLowerCase();
export function findSavedCase(text, saved) {
  const hay = squash(text);
  return saved.find((r) => r.mode === 'case' && r.matchAll.every((m) => hay.includes(m.toLowerCase()))) ?? null;
}

// ---------- dates (weekdays from the email date; public holidays ignored) ----------
const utc = (iso) => new Date(`${iso}T00:00:00Z`);
export const isWeekday = (iso) => { const d = utc(iso).getUTCDay(); return d >= 1 && d <= 5; };
export function addWeekdays(iso, n) {
  const d = utc(iso);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) n--; }
  return d.toISOString().slice(0, 10);
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDay = (iso) => { const d = utc(iso); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

// ---------- money ----------
const cents = (n) => Math.round(n * 100);
export const money = (n) => `$${(cents(n) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedMoney = (n) => `${n < 0 ? '-' : '+'}${money(Math.abs(n))}`;

// ---------- checks on a result (used at load and in tests) ----------
export function verifyCase(r) {
  const problems = [];
  const rec = r.case.reconciliation;
  const by = Object.fromEntries(rec.map((x) => [x.item, x]));
  for (const x of rec) if (cents(x.billed) - cents(x.agreed) !== cents(x.difference)) problems.push(`${x.item}: ${x.billed} - ${x.agreed} is not ${x.difference}`);
  const sub = by['Subtotal (ex GST)'], gst = by['GST (10%)'], tot = by['Total (incl GST)'];
  if (sub && gst && tot) for (const side of ['agreed', 'billed']) {
    if (Math.round(cents(sub[side]) / 10) !== cents(gst[side])) problems.push(`GST is not 10% of the ${side} subtotal`);
    if (cents(sub[side]) + cents(gst[side]) !== cents(tot[side])) problems.push(`${side} total is not subtotal + GST`);
  }
  const t = r.case.totals;
  if (tot && (cents(t.agreedTotal) !== cents(tot.agreed) || cents(t.billedTotal) !== cents(tot.billed))) problems.push('totals differ from the reconciliation table');
  if (cents(t.billedTotal) - cents(t.agreedTotal) !== cents(t.difference)) problems.push('totals.difference is wrong');
  if (!r.stamp.title.includes(money(t.difference))) problems.push('the stamp title does not show the computed difference');
  for (const d of [r.stamp.due, r.case.outcomeDue?.date, ...r.case.nextSteps.map((s) => s.due)]) if (d && !isWeekday(d)) problems.push(`${d} is not a weekday`);
  return problems;
}

// Live mode: every due date counts weekdays from the real email date. Demo mode shows the saved dates as written.
export function rebaseDates(r, emailISO) {
  const out = structuredClone(r);
  out.stamp.due = addWeekdays(emailISO, PRIMARY_DUE_WEEKDAYS);
  for (const s of out.case.nextSteps) s.due = addWeekdays(emailISO, 1);
  if (out.case.outcomeDue) out.case.outcomeDue.date = addWeekdays(emailISO, 10);
  out.case.dueDateNote = `Due dates count weekdays from ${formatDay(emailISO)} ${utc(emailISO).getUTCFullYear()}. Public holidays are ignored.`;
  return out;
}

// Next steps shown at Level 1 (ordered by deadline, then rank). onlyIf steps need provenance signals on the invoice.
export function visibleSteps(r, invoiceHasSignals) {
  return r.case.nextSteps
    .filter((s) => !s.onlyIf || invoiceHasSignals)
    .sort((a, b) => a.due.localeCompare(b.due) || a.rank - b.rank);
}

// ---------- quotes: every document quote must be in that document ----------
export const normQuote = (s) => cleanText(String(s ?? '').replace(/[|*_`]/g, ' ')).toLowerCase();
export function checkQuotes(r, textByRole) {
  const bad = [];
  const need = (role, quote) => { if (quote && !normQuote(textByRole[role] ?? '').includes(normQuote(quote))) bad.push({ role, quote }); };
  for (const c of r.checks) for (const q of c.quotes ?? []) need(q.doc, q.text);
  for (const x of r.case.reconciliation) { need('agreement', x.quoteAgreed); need('invoice', x.quoteBilled); }
  return bad;
}

// ---------- provenance for a bundle ----------
export function bundleProvenance(docs, { fromMail = false } = {}) {
  return docs.map((d) => {
    const signals = provenanceSignals({ meta: d.meta, role: d.role, text: d.text ?? '', fromMail });
    return { name: d.name, role: d.role, signals, summary: provenanceSummary(signals), demo: Boolean(d.demoMeta) };
  });
}
export const checkSignals = (p) => p.signals.filter((s) => s.severity === 'check');
export { printedDate };

// ---------- an agreement that was not attached ----------
export const NO_AGREEMENT_NOTE = 'Agreement not attached: amounts checked against the email only.';
export const NOT_VERIFIED = 'Not verified from a document';
export const hasAgreement = (docs) => docs.some((d) => !d.notRead && d.role === 'agreement');

// The saved result still matches (the email names both references), but no agreed-side quote may come from the saved
// text, because no document backs it up.
export function withoutAgreement(r) {
  const out = structuredClone(r);
  out.case.noAgreement = true;
  for (const x of out.case.reconciliation) { x.quoteAgreed = ''; x.agreedNote = NOT_VERIFIED; }
  for (const c of out.checks) if (c.quotes) c.quotes = c.quotes.map((q) => (q.doc === 'agreement' ? { doc: q.doc, text: '', note: NOT_VERIFIED } : q));
  return out;
}

// ---------- one row per file ----------
// Gmail labels chips "Preview attachment <name>" or "Download attachment <name>". The same file is one file.
export const cleanFileName = (name) =>
  String(name ?? '').replace(/^\s*(?:(?:preview|download|open)\s+)?attachment[:\s]+/i, '').replace(/^\s*(?:preview|download|open)\s+/i, '').replace(/\s+/g, ' ').trim();
export const normFileName = (name) => cleanFileName(name).toLowerCase();

// Keeps the first row per normalised name. A read file always beats a "Not read" row for the same file.
export function uniqueFiles(docs) {
  const byKey = new Map();
  for (const d of docs) {
    const key = d.kind === 'email' ? `email:${d.name}` : normFileName(d.name);
    const seen = byKey.get(key);
    if (!seen || (seen.notRead && !d.notRead)) byKey.set(key, { ...d, name: d.kind === 'email' ? d.name : cleanFileName(d.name) });
  }
  return [...byKey.values()];
}

// ---------- the finding behind each step ----------
const firstSentence = (s) => /^[^.!?]*[.!?]/.exec(s ?? '')?.[0] ?? s ?? '';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Live results have no hand-written map, so the same shape is built from the result itself.
export function deriveFindings(r) {
  const check = (key) => r.checks.find((c) => c.key === key);
  const because = (key, label) => ({ check: label, status: check(key)?.status ?? 'concern', text: firstSentence(check(key)?.answer) });
  const steps = r.case.nextSteps.map((s) => {
    const fam = s.basis.some((b) => /^H4/.test(b)) ? ['governance', 'Governance', 'governance']
      : s.basis.includes('H1.3') ? ['misleading', 'Misleading', 'misleading']
      : s.basis.includes('H2.3') ? ['provenance', 'Provenance', null]
      : null;
    return {
      id: s.rank, action: s.action, owner: s.owner, due: s.due, basis: s.basis,
      because: fam ? (fam[0] === 'provenance' ? { check: 'Provenance', status: 'check', text: 'The invoice file shows signals worth checking.' } : because(fam[0], fam[1])) : { check: 'Complaint', status: 'received', text: 'Received.' },
      evidence: fam?.[2] ?? null, ...(s.onlyIf ? { onlyIf: s.onlyIf } : {}),
    };
  });
  const supported = r.case.claims.filter((c) => /^supported/.test(c.status)).length;
  return {
    caseId: r.id,
    stamp: { because: { ...because('accuracy', 'Accuracy') }, action: r.stamp.title, owner: r.stamp.owner, due: r.stamp.due, basis: r.stamp.basis, evidence: 'accuracy' },
    alsoNeeded: steps.filter((s) => !s.onlyIf), pathOnly: steps.filter((s) => s.onlyIf),
    collapsedChecks: r.noConcernsLine,
    accuracyDefaultRows: ['Rate per box (ex GST)', 'Total (incl GST)'], accuracyMoreLabel: 'Show subtotal and GST',
    claimsSummary: `${supported} ${supported === 1 ? 'claim' : 'claims'} supported, ${r.case.claims.length - supported} not shown in the documents.`,
  };
}
export const becauseLabel = (b) => `Because ${b.check} · ${cap(b.status)}`;

// "Files: 3 read" counts attachments and dropped files, not the email body.
export function fileSummary(docs) {
  const files = docs.filter((d) => d.kind !== 'email');
  const read = files.filter((d) => !d.notRead).length;
  const notRead = files.length - read;
  return { read, notRead, text: `Files: ${read} read${notRead ? `, ${notRead} not read` : ''}` };
}
