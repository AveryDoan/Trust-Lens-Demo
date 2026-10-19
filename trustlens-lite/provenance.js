// Local provenance check from file metadata. Signals only: never a verdict, never a claim about intent.

const DESIGN_TOOLS = /canva|photoshop|illustrator|adobe express|figma|pixlr|pdfescape|sejda|ilovepdf|smallpdf|acrobat (?:pro|distiller|editing)|pdf editor|foxit phantom/i;
const ACCOUNTING = /xero|myob|quickbooks|\bsap\b|netsuite|oracle|zoho|billing|invoic/i;
const PRINT_DRIVERS = /chromium|skia|microsoft.*print to pdf|cairo|cups|quartz pdfcontext|libreoffice|microsoft.{0,10}word|word for/i;
const ORG_WORDS = /\b(pty|ltd|limited|inc|llc|co|company|services|group|council|department|corporation|corp|association|partners)\b/i;

export const NOTE = 'Metadata can be changed or removed. It is a clue, not proof.';
export const CLEAN = 'No signals found. This does not prove it is genuine.';

// "D:20261019112206+00'00'" or "D:20261019112206Z" -> ISO string with offset. Returns '' when it cannot be read.
export function parsePdfDate(s) {
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{0,2}'?)?$/.exec(String(s ?? '').trim());
  if (!m) return '';
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz = 'Z'] = m;
  let off = 'Z';
  if (tz !== 'Z') { const t = /([+-])(\d{2})'?(\d{2})?/.exec(tz); off = t ? `${t[1]}${t[2]}:${t[3] ?? '00'}` : 'Z'; if (off === '+00:00') off = 'Z'; }
  return `${y}-${mo}-${d}T${h}:${mi}:${se}${off}`;
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const iso = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? '' : v; };

// Raw pdf.js info or docx core properties -> one shape.
export function normaliseMeta(raw = {}, extra = {}) {
  return {
    title: clean(raw.Title ?? raw.title),
    author: clean(raw.Author ?? raw.author ?? raw.creator_name),
    creator: clean(raw.Creator ?? raw.creator_app ?? raw.creator),
    producer: clean(raw.Producer ?? raw.producer),
    created: iso(raw.created) || parsePdfDate(raw.CreationDate),
    modified: iso(raw.modified) || parsePdfDate(raw.ModDate),
    version: clean(raw.PDFFormatVersion ?? raw.version),
    encrypted: Boolean(raw.encrypted ?? raw.EncryptFilterName),
    pages: extra.pages ?? raw.pages ?? null,
  };
}

export const isEmptyMeta = (m) => !m || (!m.creator && !m.producer && !m.author && !m.created && !m.modified);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
// "25 September 2026" -> "2026-09-25"
export function parsePrintedDate(s) {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s ?? '');
  const mi = m ? MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))) : -1;
  return m && mi >= 0 ? `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

// The date printed on the document itself (invoice date, agreement date), if there is one.
export function printedDate(text, role) {
  if (role === 'invoice') return parsePrintedDate(/invoice date\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i.exec(text)?.[1]);
  if (role === 'agreement') return parsePrintedDate(/(?:signed|dated|date of agreement|agreement date)[^0-9]{0,20}(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i.exec(text)?.[1]);
  return '';
}

// The party issuing the document: first line that looks like an organisation name.
export function issuerName(text) {
  return /([A-Z][\w&'. -]{2,60}\b(?:Pty Ltd|Pty|Ltd|Limited|Inc|Services|Council))/.exec(text ?? '')?.[1]?.trim() ?? '';
}

const DAY = 86400000;

// Returns the signals for one file. Each is { id, label, reason, severity: 'info'|'check' }.
export function provenanceSignals({ meta, role, text = '', fromMail = false }) {
  const out = [];
  const tools = `${meta?.creator ?? ''} ${meta?.producer ?? ''}`;
  const p1 = DESIGN_TOOLS.test(tools);
  const created = Date.parse(meta?.created || '');
  const modified = Date.parse(meta?.modified || '');
  const p3 = !Number.isNaN(created) && !Number.isNaN(modified) && modified - created > 60000;

  if (p1) out.push({ id: 'P1', label: 'Design or editing tool', reason: 'Made or edited in a design tool, not a billing system.', severity: 'check' });
  if (role === 'invoice' && tools.trim() && !ACCOUNTING.test(tools) && !PRINT_DRIVERS.test(tools) && (p1 || p3)) {
    out.push({ id: 'P2', label: 'Not from a billing system', reason: 'An invoice would usually come from an accounting system.', severity: 'info' });
  }
  if (p3) out.push({ id: 'P3', label: 'Modified after creation', reason: 'The file was changed after it was first created.', severity: 'check' });

  const printed = printedDate(text, role);
  if (printed && !Number.isNaN(created) && Math.abs(created - Date.parse(`${printed}T00:00:00Z`)) > DAY * 1.5) {
    out.push({ id: 'P4', label: 'Date conflict', reason: `The file was created on a different day from the date printed in it (${printed}).`, severity: 'check' });
  }
  if (isEmptyMeta(meta)) out.push({ id: 'P5', label: 'Missing metadata', reason: 'The file has no creator, producer or dates.', severity: 'check' });

  const issuer = issuerName(text);
  const author = meta?.author ?? '';
  if (author && issuer && ORG_WORDS.test(author) && !issuer.toLowerCase().includes(author.toLowerCase().replace(/\s+(pty|ltd).*$/, '')) ) {
    out.push({ id: 'P6', label: 'Author differs from the issuer', reason: 'The author is a different organisation from the issuer named in the document.', severity: 'check' });
  }
  if (!fromMail) out.push({ id: 'P7', label: 'Not read from the mail source', reason: 'The file was dropped in, not read from the open email.', severity: 'info' });
  return out;
}

// "No signals" / "1 signal: check" / "2+ signals: verify at source". Only 'check' signals are counted.
export function provenanceSummary(signals) {
  const n = signals.filter((s) => s.severity === 'check').length;
  return n === 0 ? 'No signals' : n === 1 ? '1 signal: check' : `${n} signals: verify at source`;
}
