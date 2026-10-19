// Demo-mode helpers: Gmail-tolerant text normalising, saved-report matching, and cache keys.

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
    .replace(/\s+/g, ' ') // \s covers non-breaking spaces
    .trim()
    .toLowerCase();
}

// An entry matches when the normalised text contains any one of its normalised matchPhrases, so a selected
// paragraph still matches. Returns the entry or null.
export function findDemoEntry(text, entries) {
  const haystack = normalise(text);
  if (!haystack) return null;
  return entries.find((e) => e.matchPhrases.some((p) => haystack.includes(normalise(p)))) ?? null;
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Cache key for live results: SHA-256 of the normalised masked text.
export const cacheKey = (maskedText) => sha256Hex(normalise(maskedText));
