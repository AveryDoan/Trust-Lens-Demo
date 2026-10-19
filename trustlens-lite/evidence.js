// Evidence for the complaint case: quotes from the files, checked against the files that were actually read.
// The quotes come from demo-evidence.json and are used exactly as written. This module never writes or edits a quote.
// Matching is against the REDACTED text (what the AI would see), so personal details can never come back out.
import { scanPii } from './pii.js';
import { normQuote } from './case.js';

export const NOT_FOUND = 'Not found in the file you dropped';
export const NOT_READ = 'File not read';
export const CLUE = 'A clue, not proof.';

// entry.doc -> which of the read documents holds the text
const matchers = {
  invoice: (d) => d.role === 'invoice',
  agreement: (d) => d.role === 'agreement',
  emails: (d) => d.role === 'correspondence' && d.kind !== 'email',
  email: (d) => d.kind === 'email',
};
export const sourceFor = (doc, docs) => docs.find((d) => !d.notRead && d.text && matchers[doc]?.(d)) ?? null;

// Redacted text of a document, computed once.
const maskedOf = (d) => (d.masked ??= scanPii(d.text).maskedText);
const maskedPages = (d) => (d.pageMasked ??= (d.pageTexts ?? []).map((t) => scanPii(t).maskedText));

// Anything shown or copied goes through this: if a stored quote ever held a personal detail, it is masked here too.
export const safeText = (s) => scanPii(String(s ?? '')).maskedText;

// One entry: 'verified' (found, with the page when it sits on one page), 'notfound', or 'notread'.
export function verifyEntry(entry, docs) {
  const d = sourceFor(entry.doc, docs);
  if (!d) return { status: 'notread', page: null };
  if (entry.kind === 'metadata') return { status: 'verified', page: null, file: d.name };
  const q = normQuote(entry.text);
  if (!q || !normQuote(maskedOf(d)).includes(q)) return { status: 'notfound', page: null };
  const pages = maskedPages(d);
  const at = pages.findIndex((p) => normQuote(p).includes(q));
  return { status: 'verified', page: at >= 0 && pages.length > 1 ? at + 1 : at >= 0 && pages.length === 1 ? 1 : null, file: d.name };
}

// Resolves every step and callout. The result holds only what may be displayed: a quote's text is present only
// when it was verified.
export function resolveEvidence(evidence, docs) {
  const one = (entry) => {
    const v = verifyEntry(entry, docs);
    const base = { kind: entry.kind ?? 'quote', doc: entry.doc, label: entry.label, shows: entry.shows, status: v.status, page: v.page ?? null, file: v.file ?? null };
    if (entry.kind === 'metadata') return { ...base, fields: entry.fields };
    return v.status === 'verified' ? { ...base, text: safeText(entry.text) } : base;
  };
  const out = { steps: {}, callouts: {} };
  for (const [id, list] of Object.entries(evidence.steps ?? {})) out.steps[id] = list.map(one);
  for (const [id, list] of Object.entries(evidence.callouts ?? {})) out.callouts[id] = list.map(one);
  return out;
}

// "Found in Agreement, page 2": the label of the file, and the page only when it is known.
export const foundLine = (item) => `Found in ${item.label}${item.page ? `, page ${item.page}` : ''}`;

// Level 2 lists. Accuracy uses the approve quotes, Governance uses privacy, Misleading uses refer plus the invoice and
// agreement quotes about rush that already sit in the approve list (found by their stored text in the JSON).
const RUSH_INVOICE = /^Rush tier applied/;
const RUSH_AGREEMENT = /^If the Customer has not made a written rush request/;
export function levelTwoItems(key, ev, raw) {
  if (!ev) return null;
  if (key === 'accuracy') return ev.steps.approve ?? null;
  if (key === 'governance') return ev.steps.privacy ?? null;
  if (key === 'misleading') {
    const at = (re, doc) => (raw?.steps?.approve ?? []).findIndex((e) => e.doc === doc && re.test(e.text ?? ''));
    const picks = [at(RUSH_INVOICE, 'invoice'), at(RUSH_AGREEMENT, 'agreement')].filter((i) => i >= 0).map((i) => ev.steps.approve[i]);
    return [...(ev.steps.refer ?? []), ...picks];
  }
  return null;
}

// Counts for the audit record. Step ids and numbers only, never any quote text.
export function auditCounts(ev) {
  const steps = Object.entries(ev?.steps ?? {}).map(([id, list]) => {
    const q = list.filter((i) => i.kind === 'quote');
    return { id, verified: q.filter((i) => i.status === 'verified').length, notFound: q.filter((i) => i.status === 'notfound').length, notRead: q.filter((i) => i.status === 'notread').length };
  });
  return { steps, verified: steps.reduce((a, s) => a + s.verified, 0), notFound: steps.reduce((a, s) => a + s.notFound, 0), notRead: steps.reduce((a, s) => a + s.notRead, 0) };
}

// Plain text for "Copy evidence": the action, each verified quote with its file label, then the rule. Redacted.
export function evidenceText({ action, owner, due, because, items, rule, date }) {
  const lines = [`${action}${owner ? ` (${owner}${due ? `, due ${due}` : ''})` : ''}`];
  if (because) lines.push(`Because ${because}`);
  const quotes = items.filter((i) => i.kind === 'quote' && i.status === 'verified');
  if (quotes.length) lines.push('Evidence:', ...quotes.map((i) => `- ${foundLine(i)} (${i.shows}): "${i.text}"`));
  if (rule) lines.push(`Rule: ${rule}`);
  lines.push(`Checked with TrustLens Lite${date ? ` on ${date}` : ''}; a person makes the final decision.`);
  return safeText(lines.join('\n'));
}
