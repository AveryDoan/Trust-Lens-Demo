// Runs the product's own evidence.js on the real files: every quote is checked against the redacted text of the
// three PDFs and the complaint email, exactly as the panel does. The video shows only quotes that verify here.
import { readFileSync, writeFileSync } from 'node:fs';
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
// the open message: the text of the test message used by the Gmail tests
const html = readFileSync(path.join(product, 'tests/fixtures/gmail-complaint.html'), 'utf8');
docs.push({ name: 'Open email', kind: 'email', text: cleanText(html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')), role: 'email' });
for (const d of docs) d.masked = scanPii(d.text).maskedText;

const raw = JSON.parse(readFileSync(path.join(D, 'demo-evidence.json'), 'utf8'));
const resolved = resolveEvidence(raw, docs);
const audit = auditCounts(resolved);
writeFileSync(path.join(root, 'src/data/evidence-resolved.json'), JSON.stringify({ resolved, audit }, null, 2) + '\n');
console.log(`evidence: ${audit.verified} verified, ${audit.notFound} not found, ${audit.notRead} not read`);
