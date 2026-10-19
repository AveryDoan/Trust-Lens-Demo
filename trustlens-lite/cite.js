// Policy citations. Every quote shown to a person comes from policies.json via this module, never from the model.
import { policies, activePack, activePackId } from './policies.js';

export const GUIDANCE_LABEL = 'TrustLens guidance, not RIMPA policy';
export const CHECK_KEYS = ['bias', 'accuracy', 'deception', 'governance'];

// Lookup tables follow the active pack (the organisation profile). Rebuilt when the pack changes.
let cached = { id: null, map: null, ids: null };
function tables() {
  if (cached.id !== activePackId) {
    const map = new Map(policies.map((p) => [p.id, p]));
    cached = { id: activePackId, map, ids: new Set(map.keys()) };
  }
  return cached;
}
const byId = { get: (id) => tables().map.get(id) };
export const knownIds = {
  has: (id) => tables().ids.has(id),
  get size() { return tables().ids.size; },
  [Symbol.iterator]: () => tables().ids[Symbol.iterator](),
};

// A citation for display: { id, document, version, section, quote, parts }. Unknown ids give null.
export function citation(id) {
  const p = byId.get(id);
  if (!p) return null;
  return {
    id: p.id,
    document: p.document,
    version: p.version,
    section: p.section,
    quote: typeof p.quote === 'string' ? p.quote : '',
    parts: p.parts ?? null,
  };
}

export const citationsFor = (ids) => (Array.isArray(ids) ? ids : []).map(citation).filter(Boolean);

// Adds check.citations (looked up in code) to a copy of the report.
export function attachCitations(report) {
  const out = { ...report };
  for (const k of CHECK_KEYS) {
    const c = report[k];
    out[k] = { ...c, citations: citationsFor(c.basis), guidance_only: c.status !== 'OK' && !citationsFor(c.basis).length };
  }
  return out;
}

// Retention is never invented: the policy gives no fixed period.
const RETENTION_C3 =
  'Kept in a secured case file for the period defined in the RIMPA disposal authority, or the NAA records authorities if RIMPA has none (Complaints and Grievance Policy s12).';
export function retentionFor(report) {
  const ids = CHECK_KEYS.flatMap((k) => report[k]?.basis ?? []);
  return activePackId === 'rimpa' && ids.includes('C3') ? RETENTION_C3 : activePack().retention;
}

const asParts = (c) => (c.parts ?? [{ document: c.document, version: c.version, section: c.section, quote: c.quote }]);

// One line per cited passage; V1 expands to its four document-control rows.
export function citationLines(cites) {
  return cites.flatMap(asParts).map((p) => {
    const where = `${activePack().citePrefix}${p.document} v${p.version}, s${p.section}`;
    return p.quote ? `${where}: "${p.quote}"` : where;
  });
}

// "Recommended action: <label>. Basis: ... Checked with TrustLens Lite on <date>; a person makes the final decision."
export function formatCitation(label, cites, date) {
  const basis = cites.length ? citationLines(cites).join('; ') : GUIDANCE_LABEL;
  return `Recommended action: ${label}. Basis: ${basis}. Checked with TrustLens Lite on ${date}; a person makes the final decision.`;
}
