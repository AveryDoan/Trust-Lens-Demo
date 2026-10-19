// Local PII scan. Runs in the browser before any network request.
// Findings carry type and offsets into the ORIGINAL text, never the matched value.

const TOKENS = { email: '[EMAIL]', phone: '[PHONE]', tfn: '[TFN]', card: '[CARD]', dob: '[DOB]', address: '[ADDRESS]' };

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const CARD_RE = /(?<!\d)(?:\d[ -]?){12,15}\d(?!\d)/g;
// Mobile: 04XX XXX XXX, +61 4XX XXX XXX. Landline: 0X XXXX XXXX, (0X) XXXX XXXX, +61 X XXXX XXXX (X = 2,3,7,8).
const PHONE_RE =
  /(?<![\d+])(?:(?:\+61[ -]?4|04)\d{2}[ -]?\d{3}[ -]?\d{3}|(?:\+61[ -]?[2378]|\(0[2378]\)|0[2378])[ -]?\d{4}[ -]?\d{4})(?!\d)/g;
// A date only counts as a date of birth when words like "date of birth", "DOB" or "born" come first, so invoice and
// meeting dates stay readable.
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DOB_RE = new RegExp(
  `(?<=\\b(?:date\\s+of\\s+birth|d\\.?o\\.?b\\.?|born(?:\\s+on)?)\\s*(?:is|was|:|-)?\\s*)(?:\\d{1,2}\\s+${MONTH}\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4})(?!\\d)`,
  'gi',
);
// Street address: number, street name, street type, optional suburb, state and postcode.
const STREET = '(?:Street|St|Road|Rd|Lane|Ln|Court|Ct|Avenue|Ave|Drive|Dr|Place|Pl|Crescent|Cres|Parade|Terrace|Way|Boulevard|Blvd)';
const ADDRESS_RE = new RegExp(
  `\\b\\d{1,5}[A-Za-z]?\\s+(?:[A-Z][a-z]+\\s+){1,3}${STREET}\\b(?:,?\\s+[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?(?=,?\\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\\b))?(?:,?\\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\\b)?(?:\\s+\\d{4}(?!\\d))?`,
  'g',
);
const TFN_RE = /(?<!\d)\d{3} ?\d{3} ?\d{3}(?!\d)/g;

export function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// The ATO checksum filters out most 9-digit order and reference numbers.
export function tfnValid(digits) {
  if (/^(\d)\1+$/.test(digits)) return false; // 000 000 000 passes the checksum but is not a real TFN (it appears in ABN placeholders)
  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  return sum % 11 === 0;
}

const digitsOf = (s) => s.replace(/\D/g, '');

// Order matters: when matches overlap, the earlier detector wins.
const DETECTORS = [
  { type: 'email', re: EMAIL_RE, ok: () => true },
  {
    type: 'card',
    re: CARD_RE,
    ok: (m) => {
      const d = digitsOf(m);
      return d.length >= 13 && d.length <= 16 && luhnValid(d);
    },
  },
  { type: 'dob', re: DOB_RE, ok: () => true },
  { type: 'address', re: ADDRESS_RE, ok: () => true },
  { type: 'phone', re: PHONE_RE, ok: () => true },
  { type: 'tfn', re: TFN_RE, ok: (m) => tfnValid(digitsOf(m)) },
];

export function scanPii(text) {
  const accepted = [];
  for (const { type, re, ok } of DETECTORS) {
    for (const m of text.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (!ok(m[0])) continue;
      if (accepted.some((f) => start < f.end && end > f.start)) continue;
      accepted.push({ type, start, end });
    }
  }
  const findings = accepted.sort((a, b) => a.start - b.start);

  let maskedText = '';
  let pos = 0;
  for (const f of findings) {
    maskedText += text.slice(pos, f.start) + TOKENS[f.type];
    pos = f.end;
  }
  maskedText += text.slice(pos);
  return { maskedText, findings };
}

export function countByType(findings) {
  const counts = {};
  for (const f of findings) counts[f.type] = (counts[f.type] || 0) + 1;
  return counts;
}

// "3 items masked: 1 email, 2 phone"
export function summarizeFindings(findings) {
  if (findings.length === 0) return 'No personal data found to mask.';
  const parts = Object.entries(countByType(findings)).map(([t, n]) => `${n} ${t}`);
  const n = findings.length;
  return `${n} ${n === 1 ? 'item' : 'items'} masked: ${parts.join(', ')}`;
}
