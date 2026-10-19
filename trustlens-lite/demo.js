// Demo-mode helpers: Gmail-tolerant text normalising, saved-report matching, and cache keys.

const DASHES = /[\u2010-\u2015\u2212]/g;
const CURLY_SINGLE = /[‘’‛]/g;
const CURLY_DOUBLE = /[“”]/g;

// Trim, collapse whitespace, lowercase. Drops quoted-reply lines ("> ...", "On ... wrote:") and
// signature blocks (from a line starting "-- " to the end). Both the text and the match phrases go through this.
export function normalise(text) {
  const kept = [];
  for (const line of String(text ?? '').replace(/\r/g, '').split('\n')) {
    if (/^-- ?$/.test(line.trimEnd()) || line.startsWith('-- ')) break; // signature starts here
    if (/^\s*>/.test(line)) continue;
    if (/^\s*On .+ wrote:\s*$/i.test(line)) continue;
    kept.push(line);
  }
  return kept.join(' ')
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ') // \s covers non-breaking spaces
    .trim()
    .toLowerCase();
}

// An entry matches when the normalised text contains any one of its normalised matchPhrases, so a selected
// paragraph still matches. When several entries match (the same words can appear in an email and in a document),
// the best score wins: phrases found, plus the share of the entry's evidence quotes found in the text, plus a small
// bonus when the entry's kind (email or file) is the kind being checked. Returns the entry or null.
export function findDemoEntry(text, entries, preferKind = null) {
  const haystack = normalise(text);
  if (!haystack) return null;
  let best = null;
  let bestScore = 0;
  for (const e of entries) {
    const hits = e.matchPhrases.filter((p) => haystack.includes(normalise(p))).length;
    if (!hits) continue;
    const quotes = ['bias', 'accuracy', 'deception', 'governance'].flatMap((k) => e.report?.[k]?.evidence ?? []);
    const found = quotes.filter((q) => haystack.includes(normalise(q))).length;
    const score = hits + (quotes.length ? (found / quotes.length) * 10 : 0) + (preferKind && e.kind === preferKind ? 0.5 : 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Cache key for live results: SHA-256 of the normalised masked text.
export const cacheKey = (maskedText) => sha256Hex(normalise(maskedText));
