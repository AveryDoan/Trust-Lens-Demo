// Live mode for a case bundle: ONE model call extracts facts and numbers; code does all the arithmetic,
// dates, ordering and policy ids. The model never states a total, a difference or a due date that is used.
import { ROLE_LABELS, addWeekdays, money, normQuote, PRIMARY_DUE_WEEKDAYS, formatDay } from './case.js';

export const CASE_SYSTEM_PROMPT = `You are TrustLens. You help staff handle a customer complaint that arrives with attached documents.
Read the documents and return facts only, as one JSON object. Do not calculate totals, differences or due dates: the system does that.
Rules:
- Quotes must be copied exactly from the document they name. Never paraphrase inside a quote.
- A claim is "supported" only if the documents show it, otherwise "not_shown". Never call anything fraud yourself: a fraud allegation by a customer is an allegation, not a finding.
- Describe an internal message about stalling customers as a possible conduct issue for review, never as a legal conclusion.
- Use plain English, short sentences, hedged where needed. Do not say "potential concern": the status says it.
- Numbers are plain numbers (no $ or commas). Dates are YYYY-MM-DD.
Return exactly this shape:
{ "documents": [ { "index": 0, "role": "invoice|agreement|correspondence|other", "confidence": 0.9, "keyFacts": ["max 3"], "pii": ["date of birth","home address","mobile numbers","email addresses"] } ],
  "invoice": { "number": "", "date": "", "dueDate": "", "lines": [ { "description": "", "quantity": 0, "unitPrice": 0, "amount": 0 } ], "statedSubtotal": 0, "statedGst": 0, "statedTotal": 0, "paidDate": "", "note": "" },
  "agreement": { "reference": "", "signedDate": "", "paymentTermsDays": 0, "lines": [ { "description": "", "quantity": 0, "unitPrice": 0, "amount": 0 } ], "statedSubtotal": 0, "statedGst": 0, "statedTotal": 0 },
  "claims": [ { "claim": "", "status": "supported|not_shown" } ],
  "flags": { "billingDiscrepancy": false, "writtenComplaint": false, "personalInfoShared": false, "staffAskedForPii": false, "fraudAllegation": false, "internalStallingMessage": false },
  "quotes": { "agreedRate": "", "billedRate": "", "agreedSubtotal": "", "billedSubtotal": "", "agreedTotal": "", "billedTotal": "" },
  "checks": { "bias": { "status": "ok|note|concern", "answer": "max 30 words" }, "accuracy": { "status": "", "answer": "" },
              "misleading": { "status": "", "answer": "", "quotes": [ { "doc": "invoice|agreement|correspondence", "text": "" } ] }, "governance": { "status": "", "answer": "" } } }`;

const num = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} must be a number`); return v; };
const cents = (n) => Math.round(n * 100);

export function validateExtraction(x) {
  if (!x || typeof x !== 'object') throw new Error('not an object');
  if (!Array.isArray(x.documents)) throw new Error('documents missing');
  for (const side of ['invoice', 'agreement']) {
    if (!x[side] || !Array.isArray(x[side].lines)) throw new Error(`${side}.lines missing`);
    x[side].lines.forEach((l, i) => { num(l.unitPrice, `${side}.lines[${i}].unitPrice`); num(l.quantity, `${side}.lines[${i}].quantity`); });
  }
  if (!x.flags || !x.checks) throw new Error('flags or checks missing');
  return x;
}

// Lines -> numbers computed in code. A stated total that does not equal the sum of its lines is flagged, never used.
export function computeSide(side) {
  const lineAmounts = side.lines.map((l) => cents(l.quantity * l.unitPrice));
  const sub = lineAmounts.reduce((a, b) => a + b, 0) / 100;
  const gst = Math.round(cents(sub) / 10) / 100;
  const total = (cents(sub) + cents(gst)) / 100;
  const warnings = [];
  if (side.statedSubtotal != null && cents(side.statedSubtotal) !== cents(sub)) warnings.push(`stated subtotal ${money(side.statedSubtotal)} is not the sum of its lines (${money(sub)})`);
  if (side.statedTotal != null && cents(side.statedTotal) !== cents(total)) warnings.push(`stated total ${money(side.statedTotal)} does not equal the lines plus 10% GST (${money(total)})`);
  const rate = side.lines.length === 1 ? side.lines[0].unitPrice : null;
  return { sub, gst, total, rate, warnings };
}

export function composeCase(x, { emailISO, docTexts = {} }) {
  validateExtraction(x);
  const A = computeSide(x.agreement), I = computeSide(x.invoice);
  const diffTotal = Math.round((cents(I.total) - cents(A.total))) / 100;
  const q = (k, role) => (normQuote(docTexts[role] ?? '').includes(normQuote(x.quotes?.[k])) ? x.quotes[k] : ''); // unverified quotes are dropped
  const row = (item, agreed, billed, qa, qb) => ({ item, agreed, billed, difference: (cents(billed) - cents(agreed)) / 100, quoteAgreed: q(qa, 'agreement'), quoteBilled: q(qb, 'invoice') });
  const reconciliation = [
    ...(A.rate != null && I.rate != null ? [row('Rate per box (ex GST)', A.rate, I.rate, 'agreedRate', 'billedRate')] : []),
    row('Subtotal (ex GST)', A.sub, I.sub, 'agreedSubtotal', 'billedSubtotal'),
    row('GST (10%)', A.gst, I.gst, 'agreedTotal', 'billedSubtotal'),
    row('Total (incl GST)', A.total, I.total, 'agreedTotal', 'billedTotal'),
  ];
  const otherComparisons = [];
  if (x.agreement.paymentTermsDays && x.invoice.date && x.invoice.dueDate) {
    const d = new Date(`${x.invoice.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + x.agreement.paymentTermsDays);
    const expected = d.toISOString().slice(0, 10);
    otherComparisons.push({ item: 'Due date', agreed: `${x.agreement.paymentTermsDays} days after invoice date (${expected})`, billed: x.invoice.dueDate, result: expected === x.invoice.dueDate ? 'matches' : 'differs' });
  }
  const f = x.flags;
  const discrepancy = diffTotal > 0 || f.billingDiscrepancy;
  const needsFinance = diffTotal > 10000;
  const due1 = addWeekdays(emailISO, 1);
  const steps = [];
  if (f.writtenComplaint) steps.push({ action: 'Acknowledge the complaint in writing', owner: 'Complaints team', due: due1, basis: ['H1.1'] });
  if (f.personalInfoShared || f.staffAskedForPii) steps.push({ action: 'Notify the Privacy Officer and restrict the email thread', owner: 'Complaints team', due: due1, basis: ['H4.1', 'H4.2', ...(f.staffAskedForPii ? ['H4.4'] : [])] });
  if (f.fraudAllegation || f.internalStallingMessage) steps.push({ action: 'Refer the fraud allegation and internal message to the Complaints Manager', owner: 'Complaints Manager', due: due1, basis: ['H1.3'] });
  steps.push({ action: `Confirm invoice ${x.invoice.number || ''} exists in the billing system`.replace('  ', ' '), owner: 'Billing Manager', due: due1, basis: ['H2.3'], onlyIf: 'provenance signals on the invoice' });
  const nextSteps = steps.map((s, i) => ({ rank: i + 1, ...s }));

  const stamp = discrepancy && diffTotal > 0
    ? { title: `Approve ${money(diffTotal)} refund and corrected invoice`, reason: `Invoice is ${money(diffTotal)} above the signed agreement.`, owner: needsFinance ? 'Billing Manager and Finance Director' : 'Billing Manager', due: addWeekdays(emailISO, PRIMARY_DUE_WEEKDAYS), basis: ['H2.1', 'H3.1', ...(needsFinance ? ['H3.2'] : [])] }
    : { title: nextSteps[0].action, reason: 'Review the documents before replying.', owner: nextSteps[0].owner, due: nextSteps[0].due, basis: nextSteps[0].basis };
  const concerns = Object.values(x.checks).filter((c) => c.status === 'concern').length;
  const labels = { bias: 'Bias', accuracy: 'Accuracy', misleading: 'Misleading', governance: 'Governance' };
  const questions = { bias: 'Is the wording one-sided?', accuracy: 'Do the numbers and claims match the documents?', misleading: 'Does anything give a wrong impression?', governance: 'What should happen next, and under which rule?' };
  const checks = Object.keys(labels).map((key) => {
    const c = x.checks[key];
    const quotes = (c.quotes ?? []).filter((qt) => normQuote(docTexts[qt.doc] ?? '').includes(normQuote(qt.text)));
    return { key, label: labels[key], status: c.status, question: questions[key], answer: c.answer, ...(quotes.length ? { quotes } : {}),
      ...(key === 'governance' ? { found: (x.documents.flatMap((d) => d.pii ?? []).map((p) => p[0].toUpperCase() + p.slice(1))), basis: [...new Set(nextSteps.flatMap((s) => s.basis).filter((b) => b !== 'H2.3'))] } : {}) };
  });
  const warnings = [...A.warnings.map((w) => `Agreement: ${w}`), ...I.warnings.map((w) => `Invoice: ${w}`)];
  return {
    id: 'case-live', mode: 'case', pack: 'harbourview', overall: concerns >= 2 || discrepancy ? 'escalate' : concerns ? 'verify' : 'approve',
    stamp, checks, noConcernsLine: `No concerns: ${checks.filter((c) => c.status === 'ok').map((c) => c.label).join(', ')}`,
    case: {
      type: 'billing complaint',
      documents: x.documents.map((d) => ({ name: d.name ?? '', role: d.role, label: ROLE_LABELS[d.role] ?? 'Other', confidence: d.confidence, keyFacts: (d.keyFacts ?? []).slice(0, 3), pii: d.pii ?? [] })),
      claims: x.claims.map((c) => ({ claim: c.claim, status: c.status === 'supported' ? 'supported' : 'not shown in the documents' })),
      reconciliation, otherComparisons,
      totals: { agreedTotal: A.total, billedTotal: I.total, difference: diffTotal },
      nextSteps, outcomeDue: { date: addWeekdays(emailISO, 10), basis: ['H1.2'] },
      dueDateNote: `Due dates count weekdays from ${formatDay(emailISO)}. Public holidays are ignored.`,
      warnings,
    },
  };
}

// One request. `docs` are { name, role, maskedText } (already masked in the browser).
export async function assessCase(docs, settings, { emailISO, docTexts }) {
  const body = {
    model: settings.model, max_tokens: 4000, system: CASE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: docs.map((d, i) => `=== DOCUMENT ${i} (${d.role}) ===\n${d.maskedText}`).join('\n\n') + '\n\nReturn only the JSON object.' }],
  };
  if (/claude-(?:fable|mythos|opus|sonnet|haiku)-5/.test(settings.model)) body.output_config = { effort: 'low' };
  else body.temperature = 0.1;
  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const x = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  x.documents.forEach((d) => { d.name = docs[d.index]?.name ?? ''; });
  return composeCase(x, { emailISO, docTexts });
}
