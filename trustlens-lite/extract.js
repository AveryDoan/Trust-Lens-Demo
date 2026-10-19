// Local file text extraction. Nothing here touches the network: pdf.js and mammoth are bundled in vendor/.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FILE_CHAR_LIMIT = 6000;
export const ACCEPT = '.pdf,.docx,.txt,.md';

import { normaliseMeta } from './provenance.js';

export class FileError extends Error {}

const MSG = {
  type: 'This file type is not supported. Use a PDF, Word (.docx), text (.txt) or Markdown (.md) file.',
  empty: 'This file is empty.',
  big: 'This file is larger than 5 MB. Try a shorter file.',
  noText: 'This file has no readable text.',
  scan: 'This PDF has no readable text, it may be a scan.',
  pdf: 'This PDF could not be read. It may be damaged or password protected.',
  docx: 'This Word file could not be read. Try saving it again as .docx.',
};

// "Page 3", "Page 3 of 9", "3 of 9" and "- 3 -" on a line of their own.
const PAGE_LINE = /^\s*(?:page\s+\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?|\d{1,4}\s*(?:of|\/)\s*\d{1,4}|-\s*\d{1,4}\s*-)\s*$/i;
const LONE_NUMBER = /^\s*\d{1,3}\s*$/;

// Normalises extracted text before matching, masking and display: compatibility forms (ligatures, non-breaking
// spaces), page-number lines, hyphenated line ends, curly quotes, en/em dashes, then collapses whitespace.
export function cleanText(raw) {
  let t = String(raw ?? '').normalize('NFKC');
  t = t.replace(/[​-‍﻿­]/g, '').replace(/\r\n?/g, '\n');
  t = t.split('\n').filter((line) => !PAGE_LINE.test(line)).join('\n');
  t = t.replace(/([A-Za-z])-\n[ \t]*([a-z])/g, '$1$2');
  t = t.replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"');
  t = t.replace(/[‐-―−]/g, '-');
  return t.replace(/\s+/g, ' ').trim();
}

// PDF pages: also drops a page number alone at the top or bottom of a page, and any header or footer line that
// repeats (apart from digits) on most pages.
export function cleanPageList(pages) {
  const lines = pages.map((p) => String(p).replace(/\r\n?/g, '\n').split('\n'));
  const key = (l) => l.trim().toLowerCase().replace(/\d+/g, '#');
  const edge = (arr) => {
    const idx = arr.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
    const k = idx.length >= 6 ? 2 : 1; // short pages: only the very first and last line can be a header or footer
    return [...idx.slice(0, k), ...idx.slice(-k)];
  };
  const counts = new Map();
  for (const arr of lines) for (const i of new Set(edge(arr))) counts.set(key(arr[i]), (counts.get(key(arr[i])) || 0) + 1);
  const repeated = pages.length >= 2 ? Math.max(2, Math.ceil(pages.length * 0.6)) : Infinity;
  const kept = lines.map((arr) => {
    const drop = new Set(edge(arr).filter((i) => LONE_NUMBER.test(arr[i]) || counts.get(key(arr[i])) >= repeated));
    return arr.filter((_, i) => !drop.has(i)).join('\n');
  });
  return kept;
}
export const cleanPages = (pages) => cleanText(cleanPageList(pages).join('\n'));

// Cuts at a word boundary. Only used on masked text, so a half-cut email address can never leak.
export function truncateAtWord(text, limit) {
  if (text.length <= limit) return { text, truncated: false };
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return { text: (space > limit * 0.8 ? cut.slice(0, space) : cut).trimEnd(), truncated: true };
}

const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();

async function readPdf(buffer) {
  let pdfjs;
  try {
    pdfjs = await import('./vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href; // bundled, never a CDN
  } catch { throw new FileError(MSG.pdf); }
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useWorkerFetch: false, disableAutoFetch: true }).promise;
  } catch { throw new FileError(MSG.pdf); }
  const pages = [];
  let info = {};
  try { info = (await doc.getMetadata()).info ?? {}; } catch { /* metadata is optional */ }
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''));
    }
  } catch { throw new FileError(MSG.pdf); } finally { doc.destroy?.(); }
  const kept = cleanPageList(pages);
  const text = cleanText(kept.join('\n'));
  const meta = normaliseMeta(info, { pages: pages.length });
  if (!text) { const err = new FileError(MSG.scan); err.meta = meta; throw err; }
  return { text, meta, pageTexts: kept.map(cleanText) }; // pageTexts: where a quote was found, for "page N"
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('script failed'));
    document.head.append(s);
  });
}

// Core document properties (author, dates) from docProps/core.xml, read straight from the .docx zip.
async function zipEntry(buffer, wanted) {
  const v = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  let p = v.getUint32(eocd + 16, true);
  for (let n = v.getUint16(eocd + 10, true); n > 0; n--) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));
    if (name === wanted) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = new Uint8Array(buffer, start, csize);
      if (method === 0) return new TextDecoder().decode(raw);
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export async function readDocxMeta(buffer) {
  try {
    const xml = await zipEntry(buffer, 'docProps/core.xml');
    if (!xml) return normaliseMeta({});
    const tag = (t) => new RegExp(`<${t}[^>]*>([^<]*)</${t}>`).exec(xml)?.[1]?.trim() ?? '';
    const app = await zipEntry(buffer, 'docProps/app.xml').catch(() => null);
    return normaliseMeta({ author: tag('dc:creator'), creator: /<Application>([^<]*)<\/Application>/.exec(app ?? '')?.[1] ?? '', producer: tag('cp:lastModifiedBy'), created: tag('dcterms:created'), modified: tag('dcterms:modified'), title: tag('dc:title') });
  } catch { return normaliseMeta({}); }
}

async function readDocx(buffer) {
  try {
    if (!globalThis.mammoth) await loadScript(new URL('./vendor/mammoth.browser.min.js', import.meta.url).href);
    const { value } = await globalThis.mammoth.extractRawText({ arrayBuffer: buffer });
    return { text: cleanText(value), meta: await readDocxMeta(buffer) };
  } catch { throw new FileError(MSG.docx); }
}

// Returns { text, kind, name, size, chars }. text is cleaned and complete; truncation happens after masking.
export async function extractFile(file) {
  const kind = extOf(file.name);
  if (!['pdf', 'docx', 'txt', 'md'].includes(kind)) throw new FileError(MSG.type);
  if (file.size === 0) throw new FileError(MSG.empty);
  if (file.size > MAX_FILE_BYTES) throw new FileError(MSG.big);
  let text, meta = null, pageTexts = null;
  if (kind === 'txt' || kind === 'md') text = cleanText(await file.text());
  else if (kind === 'docx') ({ text, meta } = await readDocx(await file.arrayBuffer()));
  else ({ text, meta, pageTexts } = await readPdf(await file.arrayBuffer()));
  if (!text) throw new FileError(kind === 'pdf' ? MSG.scan : MSG.noText);
  return { text, kind, name: file.name, size: file.size, chars: text.length, meta, pages: meta?.pages ?? null, pageTexts };
}

export const formatSize = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
