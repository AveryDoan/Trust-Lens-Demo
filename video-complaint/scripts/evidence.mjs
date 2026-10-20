// Runs the product's own evidence.js on the real files: every quote is checked against the redacted text of the
// three PDFs and the complaint email, exactly as the panel does. The video shows only quotes that verify here.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const product = path.resolve(root, '../trustlens-lite');
const D = path.join(product, 'demo/case-complaint');
const imp = (f) => import(pathToFileURL(path.join(product, f)).href);
const { extractFile, cleanText } = await imp('extract.js');
const { scanPii } = await imp('pii.js');
const { detectRole } = await imp('case.js');
const { resolveEvidence, auditCounts } = await imp('evidence.js');

const docs = [];
for (const name of ['INV-DEMO-20417.pdf', '02-service-agreement-HRS-AGR-0311.pdf', 'Correspondence-thread.pdf']) {
  const r = await extractFile(new File([readFileSync(path.join(D, name))], name));
  docs.push({ name, kind: r.kind, text: r.text, pageTexts: r.pageTexts, pages: r.pages, role: detectRole(r.text).role });
}
// the open message: the product's case-email.txt when it exists, otherwise the text read off the screenshot (src/data/email-from-screenshot.txt)
const productEmail = path.join(D, 'case-email.txt');
const emailFile = existsSync(productEmail) ? productEmail : path.join(root, 'src/data/email-from-screenshot.txt');
docs.push({ name: 'Open email', kind: 'email', text: cleanText(readFileSync(emailFile, 'utf8')), role: 'email' });
const emailSource = path.relative(root, emailFile);
for (const d of docs) d.masked = scanPii(d.text).maskedText;

const raw = JSON.parse(readFileSync(path.join(D, 'demo-evidence.json'), 'utf8'));
const resolved = resolveEvidence(raw, docs);
const audit = auditCounts(resolved);
// Short excerpts of the redacted files, for the simulated document pages. Built from the real extracted text.
const around = (d, needle, before = 260, after = 260) => {
  const t = d.masked; const i = t.indexOf(needle);
  if (i < 0) throw new Error(`excerpt: "${needle}" not in ${d.name}`);
  let a = Math.max(0, i - before), b = Math.min(t.length, i + needle.length + after);
  if (a > 0) a = t.indexOf(' ', a) + 1; if (b < t.length) b = t.lastIndexOf(' ', b);
  return { before: (a > 0 ? '… ' : '') + t.slice(a, i), quote: needle, after: t.slice(i + needle.length, b) + (b < t.length ? ' …' : '') };
};
const byRole = (r) => docs.find((d) => d.role === r);
const pages = {
  invoice: { name: 'INV-DEMO-20417.pdf', ...around(byRole('invoice'), 'Rush tier applied because processing was completed within 30 days of collection.', 330, 160) },
  correspondence: { name: 'Correspondence-thread.pdf', ...around(byRole('correspondence'), 'Small regional clients always dispute invoices after paying and most of them give up if we stall for a month.', 120, 80), personal: around(byRole('correspondence'), 'my date of birth is [DOB] and my home address is [ADDRESS]', 120, 60) },
};
// the whole invoice as the AI sees it: pii.js run on the extracted text, nothing masked by hand
const invScan = scanPii(byRole('invoice').text);
pages.invoiceFull = { name: 'INV-DEMO-20417.pdf', masked: invScan.maskedText, masks: invScan.findings.map((f) => f.type) };
writeFileSync(path.join(root, 'src/data/doc-pages.json'), JSON.stringify(pages, null, 2) + '\n');
writeFileSync(path.join(root, 'src/data/evidence-resolved.json'), JSON.stringify({ emailSource, resolved, audit }, null, 2) + '\n');
console.log(`evidence: ${audit.verified} verified, ${audit.notFound} not found, ${audit.notRead} not read`);
