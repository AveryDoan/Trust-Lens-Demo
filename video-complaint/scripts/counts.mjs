// Runs the product's own pii.js on the three PDFs' extracted text. The numbers on screen come from here.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const product = path.resolve(root, '../trustlens-lite');
const D = path.join(product, 'demo/case-complaint');
const imp = (f) => import(pathToFileURL(path.join(product, f)).href);
const { scanPii } = await imp('pii.js');
const { cleanPages } = await imp('extract.js');
const pdfjs = await imp('vendor/pdf.min.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(product, 'vendor/pdf.worker.min.mjs')).href;

const FILES = [['invoice', 'INV-DEMO-20417.pdf'], ['agreement', '02-service-agreement-HRS-AGR-0311.pdf'], ['correspondence', 'Correspondence-thread.pdf']];
const byType = {};
const docs = [];
for (const [role, name] of FILES) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path.join(D, name))), isEvalSupported: false, useWorkerFetch: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) pages.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str + (i.hasEOL ? '\n' : '')).join(''));
  const scan = scanPii(cleanPages(pages));
  for (const f of scan.findings) byType[f.type] = (byType[f.type] || 0) + 1;
  docs.push({ role, name, pages: doc.numPages, items: scan.findings.length, masked: scan.maskedText });
}
// A short redacted excerpt of the correspondence, built from the real masked text.
const masked = docs.find((d) => d.role === 'correspondence').masked;
const around = (tag, before, after) => {
  const i = masked.indexOf(tag);
  if (i < 0) return '';
  let s = masked.slice(Math.max(0, i - before), i + tag.length + after).replace(/\s+/g, ' ').trim();
  if (i - before > 0) s = '… ' + s.slice(s.indexOf(' ') + 1); // start on a whole word
  return s.slice(0, s.lastIndexOf(' ')) + ' …'; // end on a whole word
};
const excerpt = [around('[EMAIL]', 40, 60), around('[DOB]', 60, 70), around('[PHONE]', 10, 30)].filter(Boolean);
const out = { total: Object.values(byType).reduce((a, b) => a + b, 0), byType, files: docs.map(({ role, name, pages, items }) => ({ role, name, pages, items })), excerpt };
writeFileSync(path.join(root, 'src/data/counts.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`counts: ${out.total} items`, JSON.stringify(byType));
