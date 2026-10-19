// Evidence in the complaint case: the path view, Level 2, Copy evidence, redaction, unverified quotes, audit record.
// Run: python3 -m http.server 8765 (in trustlens-lite), then: node tests/evidence-panel.e2e.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';

const P = process.cwd(); const C = path.join(P, 'demo/case-complaint') + '/';
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const map = JSON.parse(readFileSync(C + 'demo-findings-map.json', 'utf8'));
const saved = JSON.parse(readFileSync(C + 'demo-result-complaint.json', 'utf8'));
const { send, ev, sleep, close } = await launch(9357, path.join(tmpdir(), 'tl-evidence-panel-profile'));
await send('Page.enable'); await send('DOM.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const spy = `window.__reqs = []; const of = window.fetch; window.fetch = (u, o) => { window.__reqs.push({ url: String(u), body: o && o.body ? String(o.body) : '' }); return of.call(window, u, o); };`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: spy });
const stub = (demo, profile) => `window.chrome = { storage: { local: { async get(d) { const s = JSON.parse(localStorage.getItem('ext') || '{}'); return { ...d, ...s, endpoint: 'http://127.0.0.1:9/never', model: 'claude-sonnet-5-5', apiKey: 'k', demoMode: ${demo}, orgProfile: '${profile}' }; }, async set(o) { const s = JSON.parse(localStorage.getItem('ext') || '{}'); localStorage.setItem('ext', JSON.stringify({ ...s, ...o })); } }, session: { async get() { return {}; } }, onChanged: { addListener() {} } }, runtime: { openOptionsPage() {} } };`;
let stubId = null;
async function load(opts) {
  if (stubId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId });
  stubId = opts ? (await send('Page.addScriptToEvaluateOnNewDocument', { source: stub(opts.demo, opts.profile) })).identifier : null;
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 700, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8765/panel.html' }); await sleep(900);
  await ev('localStorage.clear(); 1');
}
async function drop(files, wait = 2300) {
  const doc = await send('DOM.getDocument'); const n = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#file-input' });
  await send('DOM.setFileInputFiles', { files, nodeId: n.nodeId }); await sleep(wait);
}
const shot = async (name) => { if (SHOTS) writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); };
// Word-count rule: every visible text node, split on spaces, tokens without a letter or digit (like the middle dot) are not words.
const WORDS = `(() => { const out=[]; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:(n)=>{ const p=n.parentElement; if(!p||['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)||p.closest('.sr-only,[hidden],svg')) return NodeFilter.FILTER_REJECT; const s=getComputedStyle(p); if(s.display==='none'||s.visibility==='hidden') return NodeFilter.FILTER_REJECT; return n.data.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP; }}); for(let n=w.nextNode();n;n=w.nextNode()) out.push(n.data.trim()); return out.join(' ').split(/\\s+/).filter((t) => /[A-Za-z0-9]/.test(t)); })()`;
const fits = () => ev('document.documentElement.scrollHeight <= document.documentElement.clientHeight');
const ext = () => ev("JSON.stringify(window.__reqs.filter((r) => new URL(r.url, location.href).origin !== location.origin))").then(JSON.parse);
const click = (sel, text) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim() === ${JSON.stringify(text)}).click(); 1`);
const text = (sel) => ev(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.innerText.replace(/\\s+/g, ' ').trim())`);
const files3 = [C + 'INV-DEMO-20417.pdf', C + '02-service-agreement-HRS-AGR-0311.pdf', C + 'Correspondence-thread.pdf'];
const pass = (m) => console.log('ok   ', m);

import { extractFile } from '../extract.js';
import { writeFileSync as wf } from 'node:fs';

const evidence = JSON.parse(readFileSync(C + 'demo-evidence.json', 'utf8'));
const orig = {}; // the original, unredacted text of each file, only to prove it never reaches the screen
for (const f of ['Correspondence-thread.pdf']) orig[f] = (await extractFile(new File([readFileSync(C + f)], f))).text;
const dobM = /date of birth is ([^.]+?) and my home address is ([^.]+)\./i.exec(orig['Correspondence-thread.pdf']);
const secrets = [dobM[1], dobM[2], ...(orig['Correspondence-thread.pdf'].match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [])];
assert.ok(secrets.length >= 3 && secrets.every((s) => s.length > 4), 'the originals exist in the unmasked text');
const allText = () => ev("document.body.innerText");

// ---------- 1. the three PDFs ----------
await load(null);
await drop(files3);
await ev("window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; 1");
await click('.bar .btn', 'Run AI'); await sleep(4300);
await click('.reading .btn', 'Show recommendations'); await sleep(250);
await click('.stamp-actions .btn', 'See the path'); await sleep(300);
const steps = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.path-list li[data-step]')].map((li) => ({ id: li.dataset.step, order: [...li.children].map((c) => c.className.split(' ')[0] || c.tagName), items: li.querySelectorAll('.ev-item, .sbs-col').length, rule: !!li.querySelector('.ev-rule blockquote'), cite: [...li.querySelectorAll('.ev-rule .btn')].map((b) => b.textContent), meta: !!li.querySelector('.ev-meta'), copy: [...li.querySelectorAll('.ev-actions .btn')].map((b) => b.textContent), link: li.querySelector('.ev-list .textlink')?.textContent ?? null })))`));
console.log('steps:', JSON.stringify(steps.map((s) => [s.id, s.items, s.link])));
assert.deepEqual(steps.map((s) => s.id).sort(), ['acknowledge', 'approve', 'privacy', 'refer', 'verify']);
for (const s of steps) {
  assert.ok(s.items >= 1, `${s.id}: at least one evidence block`);
  assert.ok(s.rule && s.cite.includes('Copy citation'), `${s.id}: the rule with Copy citation`);
  assert.ok(s.copy.includes('Copy evidence'), `${s.id}: Copy evidence`);
  assert.deepEqual(s.order.slice(0, 5), ['path-due', 'path-action', 'path-owner', 'path-because', 'ev-list'], `${s.id}: action, owner, Because, Evidence, then Rule`);
}
assert.ok(steps.find((s) => s.id === 'verify').meta, 'the verify step shows the file details, because the invoice has signals');
assert.ok(steps.every((s) => s.id === 'verify' || !s.meta));
// every step: the first quote and a "Show all evidence (N)" link where there is more
assert.equal(steps.find((s) => s.id === 'approve').link, 'Show all evidence (5)');
assert.equal(steps.find((s) => s.id === 'privacy').link, 'Show all evidence (3)');
pass('Path: each step shows evidence, the rule with Copy citation, Copy evidence; verify shows the file details');

// Agreed vs billed
const sbs = JSON.parse(await ev(`JSON.stringify({ chips: [...document.querySelectorAll('li[data-step="approve"] .sbs .role-chip')].map((c) => c.textContent), quotes: [...document.querySelectorAll('li[data-step="approve"] .sbs blockquote')].map((q) => q.textContent), amounts: document.querySelector('li[data-step="approve"] .sbs-amounts')?.textContent, found: [...document.querySelectorAll('li[data-step="approve"] .sbs .ev-found')].map((f) => f.textContent.trim()) })`));
assert.deepEqual(sbs.chips, ['Agreement', 'Invoice']);
assert.deepEqual(sbs.quotes, [evidence.steps.approve[0].text, evidence.steps.approve[2].text]);
assert.equal(sbs.amounts, 'Agreed $10,164.00 · Billed $22,044.00 · Difference +$11,880.00');
assert.ok(sbs.found.every((f) => /^✓ Found in (Agreement|Invoice), page [12]$/.test(f)), sbs.found.join(' | '));
await ev("document.querySelector('li[data-step=\"approve\"]').scrollIntoView(); 1"); await sleep(100);
await shot('path-approve');
await ev("document.querySelector('li[data-step=\"approve\"] .ev-list .textlink').click(); 1"); await sleep(100);
assert.equal(await ev("document.querySelectorAll('li[data-step=\"approve\"] .ev-more .ev-item').length"), 3, 'the other three quotes open in place');
await ev("document.querySelector('li[data-step=\"approve\"]').scrollIntoView(); 1"); await shot('path-approve-open');
pass('Approve: Agreed vs billed side by side with both quotes, amounts line, the rest opens in place');

// redaction: privacy quote shows the tags, no original detail anywhere on screen
await ev("document.querySelector('li[data-step=\"privacy\"] .ev-list .textlink').click(); 1"); await sleep(100);
const priv = await text('li[data-step="privacy"] blockquote');
assert.ok(priv.includes('my date of birth is [DOB] and my home address is [ADDRESS]'), priv.join(' | '));
const page = await allText();
for (const s of secrets) assert.ok(!page.includes(s), `original personal detail on screen: ${s}`);
assert.ok(page.includes('[DOB]') && page.includes('[ADDRESS]'));
await ev("document.querySelector('li[data-step=\"privacy\"]').scrollIntoView(); 1"); await shot('path-privacy');
// the email quotes are not verified here (no Gmail message): they say so and never show the quote
await ev("document.querySelector('li[data-step=\"refer\"] .ev-list .textlink').click(); 1"); await sleep(100);
const refer = await ev("document.querySelector('li[data-step=\"refer\"]').innerText");
assert.match(refer, /File not read/); assert.ok(!refer.includes('I also believe other customers'));
assert.match(refer, /Small regional clients always dispute invoices/); assert.match(refer, /✓ Found in Emails, page \d/);
pass('Redaction: the privacy quote shows [DOB] and [ADDRESS]; no original detail on screen; an unread email is "File not read"');

// verify: details of the invoice file
const verify = await ev("document.querySelector('li[data-step=\"verify\"]').innerText");
await ev("document.querySelector('li[data-step=\"verify\"] .ev-list .textlink').click(); 1"); await sleep(100);
const verify2 = await ev("document.querySelector('li[data-step=\"verify\"]').innerText");
assert.match(verify, /Found in Invoice, page \d/); assert.match(verify2, /Created with/); assert.match(verify2, /A clue, not proof\./);
assert.match(verify2, /P\d/);
pass('Verify: invoice date quote, then file details with the signals and "A clue, not proof."');

// timing callout
const call = await ev("document.querySelector('.path-callout').innerText");
assert.match(call, /Timing for Tue 20 Oct/); assert.match(call, /Harbourview will review it within 14 days of the notice\./);
assert.match(call, /File not read/);
pass('Timing callout shows the agreement quote; the unread email quote says "File not read"');

// Copy citation and Copy evidence
await ev("document.querySelector('li[data-step=\"approve\"] .ev-rule .btn').click(); 1"); await sleep(120);
await ev("[...document.querySelectorAll('li[data-step=\"approve\"] .ev-actions .btn')].find((b) => b.textContent === 'Copy evidence').click(); 1"); await sleep(120);
await ev("[...document.querySelectorAll('li[data-step=\"privacy\"] .ev-actions .btn')].find((b) => b.textContent === 'Copy evidence').click(); 1"); await sleep(120);
const copied = JSON.parse(await ev("JSON.stringify(window.__copied)"));
assert.equal(copied.length, 3);
assert.match(copied[0], /^Recommended action: .*Basis: .*An invoice must match the signed service agreement\./);
assert.match(copied[1], /Approve \$11,880\.00 refund and corrected invoice/); assert.match(copied[1], /Found in Agreement, page \d \(Agreed rate\): "The standard rate is \$3\.85 per box \(excluding GST\)\."/); assert.match(copied[1], /Rule: H2\.1: "An invoice must match the signed service agreement\."/);
assert.match(copied[2], /\[DOB\]/);
for (const t of copied) for (const s of secrets) assert.ok(!t.includes(s), `copied text holds ${s}`);
pass('Copy citation and Copy evidence: quotes with file labels and the rule; no original personal data');

// Level 2 (back on the result)
await click('.path .btn', 'Back to result'); await sleep(200);
await ev("document.querySelector('.stamp-because').click(); 1"); await sleep(200);
const l2 = JSON.parse(await ev(`JSON.stringify({ table: !!document.querySelector('.evidence table.recon'), sbs: !!document.querySelector('.evidence .sbs'), amounts: !!document.querySelector('.evidence .sbs-amounts'), order: [...document.querySelector('.evidence').children].map((c) => c.className || c.tagName), rule: document.querySelector('.evidence .ev-rule blockquote')?.textContent })`));
assert.ok(l2.table && l2.sbs && !l2.amounts, 'the table keeps its place; the total line is not repeated under the side-by-side');
assert.equal(l2.rule, 'An invoice must match the signed service agreement.');
assert.equal(await ev("document.querySelectorAll('.evidence .ev-item[data-status=verified], .evidence .sbs-col').length"), 5);
await ev("document.querySelectorAll('.also-row button.because')[0].click(); 1"); await sleep(200);
const g = await ev("document.querySelector('.evidence').innerText");
assert.match(g, /my date of birth is \[DOB\] and my home address is \[ADDRESS\]/); assert.match(g, /Rule/); assert.match(g, /Suspected exposure of personal information/);
for (const s of secrets) assert.ok(!g.includes(s));
pass('Level 2: accuracy keeps its table and adds the approve quotes and rule; governance adds the privacy quotes and rule');

// Level 1 still within 100 words
await ev("document.querySelectorAll('.also-row button.because')[0].click(); 1"); await sleep(150);
const words = JSON.parse(await ev(`JSON.stringify(${WORDS})`));
assert.ok(words.length <= 100, `${words.length} words`);
pass(`Level 1 is ${words.length} words`);

// audit record: step ids and counts only
const hist = JSON.parse(await ev("localStorage.getItem('tl-history')"));
const audit = hist[0].case.evidence;
assert.equal(audit.verified + audit.notFound + audit.notRead, 13, 'the 13 quotes in the five steps (the callout is not a step)');
assert.equal(audit.notRead, 3, 'the three quotes from the open email were not read');
assert.deepEqual(audit.steps.map((s) => s.id), ['approve', 'privacy', 'refer', 'acknowledge', 'verify']);
const raw = JSON.stringify(hist);
for (const q of [...Object.values(evidence.steps).flat(), ...Object.values(evidence.callouts).flat()]) if (q.text) assert.ok(!raw.includes(q.text.slice(0, 25)), `audit holds quote text: ${q.text}`);
pass(`Audit record: ${audit.verified} verified, ${audit.notFound} not found, ${audit.notRead} not read; no quote text`);

// ---------- 2. a file whose text changed ----------
const tmp = path.join(tmpdir(), 'tl-evidence-files'); mkdirSync(tmp, { recursive: true });
const txt = {};
for (const [k, f] of [['inv', 'INV-DEMO-20417.pdf'], ['agr', '02-service-agreement-HRS-AGR-0311.pdf'], ['cor', 'Correspondence-thread.pdf']]) txt[k] = (await extractFile(new File([readFileSync(C + f)], f))).text;
txt.inv = txt.inv.replace('Rush tier applied because processing was completed within 30 days of collection.', 'Standard tier applied because nothing special was done.');
assert.ok(!txt.inv.includes('Rush tier applied'));
const edited = [['invoice.txt', txt.inv], ['agreement.txt', txt.agr], ['emails.txt', txt.cor]].map(([n, t]) => { const p = path.join(tmp, n); wf(p, t); return p; });
await load(null);
await drop(edited);
await click('.bar .btn', 'Run AI'); await sleep(4300);
await click('.reading .btn', 'Show recommendations'); await sleep(250);
await click('.stamp-actions .btn', 'See the path'); await sleep(300);
await ev("document.querySelector('li[data-step=\"approve\"] .ev-list .textlink').click(); 1"); await sleep(100);
const ap = await ev("document.querySelector('li[data-step=\"approve\"]').innerText");
assert.ok(!ap.includes('Rush tier applied'), 'the changed quote is not shown');
assert.match(ap, /Not found in the file you dropped/);
assert.match(ap, /The standard rate is \$3\.85 per box/, 'the quotes that are still in the files are shown');
assert.deepEqual(await ev("[...document.querySelectorAll('li[data-step=\"approve\"] .sbs-col')].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())"), ['Agreement The standard rate is $3.85 per box (excluding GST). ✓ Found in Agreement', 'Invoice Not found in the file you dropped']);
await shot('path-not-found');
pass('A quote whose file text changed shows "Not found in the file you dropped", never the quote');

console.log('EVIDENCE PANEL E2E PASSED');
await close();
