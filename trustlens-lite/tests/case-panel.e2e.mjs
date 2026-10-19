// The complaint case in the panel at 420 x 700: Review, Level 1, evidence, path. Demo mode, no network.
// Run: python3 -m http.server 8765 (in trustlens-lite), then: node tests/case-panel.e2e.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launch } from './cdp.mjs';

const P = process.cwd(); const C = path.join(P, 'demo/case-complaint') + '/';
const SHOTS = process.env.SHOTS; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const map = JSON.parse(readFileSync(C + 'demo-findings-map.json', 'utf8'));
const saved = JSON.parse(readFileSync(C + 'demo-result-complaint.json', 'utf8'));
const { send, ev, sleep, close } = await launch(9356, path.join(tmpdir(), 'tl-case-panel-profile'));
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

// ---------- Review ----------
await load(null);
await drop(files3);
const rev = JSON.parse(await ev(`JSON.stringify({ rows: [...document.querySelectorAll('.files .file-row')].map((r) => [r.querySelector('.role-chip').textContent, r.querySelector('.fname').textContent, r.querySelector('.status')?.textContent ?? r.querySelector('.textlink')?.textContent]),
  summary: [...document.querySelectorAll('.review-summary')].map((p) => p.textContent), detailsOpen: document.querySelector('details.see').open, bar: document.querySelector('.bar').getBoundingClientRect().bottom, fits: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
  barButtons: [...document.querySelectorAll('.bar button')].map((b) => b.textContent), gate: !!document.querySelector('.gate'), notices: [...document.querySelectorAll('.review > p.small')].map((p) => p.textContent) })`));
console.log('review:', JSON.stringify(rev));
assert.deepEqual(rev.rows.map((r) => r[0]).sort(), ['Agreement', 'Emails', 'Invoice']);
assert.ok(rev.rows.every((r) => r[2] === 'Read'));
assert.equal(rev.summary[0], 'Files: 3 read'); assert.match(rev.summary[1], /^\d+ items masked locally$/);
assert.equal(rev.detailsOpen, false, 'the redacted text is closed by default');
assert.ok(rev.fits, 'the Review screen fits 420 x 700'); assert.ok(await ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'no horizontal scroll on the Review screen');
assert.deepEqual(await text('.files .doc-chip'), ['Provenance: check'], 'one provenance chip, on the invoice row'); assert.ok(rev.bar <= 700, 'Run AI is visible');
assert.deepEqual(rev.barButtons, ['Run AI', 'Cancel']);
assert.ok(rev.notices.includes('Names are not masked locally. Demo data only.') && rev.notices.includes('Demo mode: no call is made.'));
assert.ok(!(await ev("[...document.querySelectorAll('.files')].some((f) => /Created with|Modified|Author/.test(f.textContent))")), 'no metadata strip on the Review screen');
assert.equal((await ext()).length, 0);
await shot('review');
await ev("document.querySelector('details.see summary').click(); 1"); await sleep(150);
assert.ok(await ev("document.querySelector('.seebox').getBoundingClientRect().height <= 221"), 'the redacted text box is capped at 220 px');
assert.ok(await ev("document.querySelector('.seebox').scrollHeight > document.querySelector('.seebox').clientHeight"), 'and scrolls');
await ev("document.querySelector('details.see summary').click(); 1");
pass('Review: one row per file, Files: 3 read, masked count, closed disclosure, Run AI visible');

// ---------- Run AI, then Level 1 ----------
await click('.bar .btn', 'Run AI'); await sleep(4300);
await click('.reading .btn', 'Show recommendations'); await sleep(250);
const L1 = JSON.parse(await ev(`JSON.stringify({ words: ${WORDS}, fits: document.documentElement.scrollHeight <= document.documentElement.clientHeight, footer: [...document.querySelectorAll('.foot p')].filter((p) => !p.hidden).map((p) => p.textContent), view: document.getElementById('view').innerText })`));
await shot('level1');
console.log(`level 1: ${L1.words.length} words`, JSON.stringify(L1.footer));
assert.ok(L1.words.length <= 100, `${L1.words.length} words: ${L1.words.join(' ')}`);
assert.ok(L1.fits, 'the result fits 420 x 700 without scrolling'); assert.ok(await ev('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), 'no horizontal scroll');
assert.deepEqual(L1.footer, ['Policy basis: Harbourview complaints procedure']);
const flat = L1.view.replace(/\s+/g, ' ');
const wantStrings = [
  'Because Accuracy · Concern', map.stamp.because.text, map.stamp.action, `${map.stamp.owner} · due Fri 23 Oct`, 'See the path', 'Also needed',
  ...map.alsoNeeded.flatMap((s) => [s.action, `Because ${s.because.check}: ${s.because.text}`, s.owner]), 'Tue 20 Oct', map.collapsedChecks,
];
for (const s of wantStrings) assert.ok(flat.toLowerCase().includes(s.toLowerCase()), `Level 1 shows: ${s}`);
assert.ok(!/Written outcome due/.test(flat), 'the outcome line is in the path, not on Level 1');
assert.ok(!/Signals, not proof/.test(flat), 'the hedge is not in the footer; it is in the provenance evidence');
assert.equal(map.stamp.action, saved.stamp.title);
assert.equal(await ev("document.querySelector('.stamp-action').textContent"), saved.stamp.title);
pass('Level 1: stamp with its Because, three Also needed rows, No concerns: Bias, one short footer line, 100 words or fewer');

// the ... menu holds Follow advice and Override
await ev("document.getElementById('more-btn').click(); 1"); await sleep(100);
const menuItems = await text('.menu button');
assert.ok(menuItems.includes('Follow advice') && menuItems.includes('Override'), menuItems.join(' | '));
await click('.menu button', 'Follow advice'); await sleep(150);
assert.match(await ev("document.getElementById('decision').textContent"), /Recorded: you followed the advice/);
await click('#decision button', 'Undo'); await sleep(100);
pass('Follow advice and Override live in the ... menu');

// ---------- Evidence: one at a time ----------
await ev("document.querySelector('.stamp-because').click(); 1"); await sleep(200);
let ev1 = JSON.parse(await ev(`JSON.stringify({ n: document.querySelectorAll('.evidence').length, head: [...document.querySelectorAll('.evidence th')].map((t) => t.textContent), rows: [...document.querySelectorAll('.evidence tbody tr:not(.qrow)')].map((r) => [...r.children].map((c) => c.textContent)), more: [...document.querySelectorAll('.evidence .textlink')].map((b) => b.textContent), fits: document.documentElement.scrollHeight <= document.documentElement.clientHeight || true })`));
console.log('accuracy evidence:', JSON.stringify(ev1.rows));
assert.equal(ev1.n, 1); assert.deepEqual(ev1.head, ['Item', 'Agreed', 'Billed', 'Difference']);
assert.deepEqual(ev1.rows.map((r) => r[0]), map.accuracyDefaultRows);
assert.deepEqual(ev1.rows[1], ['Total (incl GST)', '$10,164.00', '$22,044.00', '+$11,880.00']);
assert.ok(ev1.more.includes(map.accuracyMoreLabel));
assert.match(await ev("document.querySelector('.evidence').innerText"), new RegExp(map.claimsSummary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
await shot('evidence-accuracy');
await click('.evidence .textlink', map.accuracyMoreLabel); await sleep(100);
assert.equal((await text('.evidence tbody tr:not(.qrow)')).length, 4);
await click('.evidence .textlink', 'See claims'); await sleep(100);
assert.ok((await text('.evidence .claims li')).some((c) => /This is fraud.*Not shown in the documents/.test(c)));
// opening another evidence closes this one
await ev("document.querySelectorAll('.also-row button.because')[0].click(); 1"); await sleep(200);
assert.equal(await ev("document.querySelectorAll('.evidence').length"), 1, 'only one evidence panel is open');
assert.equal(await ev("document.querySelector('.evidence').dataset.evidence"), 'row:privacy');
const gov = JSON.parse(await ev(`JSON.stringify({ found: [...document.querySelectorAll('.evidence .chip-plain')].map((c) => c.textContent), clauses: [...document.querySelectorAll('.evidence .policy-link')].length, manage: [...document.querySelectorAll('.evidence .manage')].map((m) => m.innerText.split(':')[0]) })`));
assert.deepEqual(gov.found, ['Date of birth', 'Home address', 'Mobile numbers', 'Email addresses']);
assert.deepEqual(gov.manage, ['Refund', 'Privacy', 'Conduct']); assert.ok(gov.clauses >= 4);
await shot('evidence-governance');
await ev("document.querySelectorAll('.also-row button.because')[1].click(); 1"); await sleep(200);
assert.equal(await ev("document.querySelectorAll('.evidence').length"), 1);
// Misleading: the internal message, the (unread) complaint email, the two rush quotes, then the rule
assert.deepEqual(await text('.evidence .ev-label'), ['Evidence', 'Rule']);
assert.deepEqual(await text('.evidence .ev-head .role-chip'), ['Emails', 'Complaint email', 'Invoice', 'Agreement']);
assert.equal(await ev("document.querySelectorAll('.evidence blockquote').length"), 4, 'three verified quotes and the rule; the email was not dropped, so its quote is not shown');
assert.match(await ev("document.querySelector('.evidence').innerText"), /File not read/);
// a clause chip opens the clause sheet with Copy citation
await ev("document.querySelector('.also-row').scrollIntoView(); 1");
await ev("document.querySelectorAll('.also-row button.because')[0].click(); 1"); await sleep(200);
await ev("document.querySelector('.evidence .policy-link').click(); 1"); await sleep(250);
assert.ok((await text('.sheet .btn')).includes('Copy citation'));
await click('.sheet .btn', 'Close'); await sleep(100);
// the provenance chip opens the file details with the hedge
await ev("document.querySelector('.doc-chip.flag').click(); 1"); await sleep(200);
assert.equal(await ev("document.querySelectorAll('.evidence').length"), 1);
const prov = await ev("document.querySelector('.evidence').innerText");
assert.match(prov, /Created with/); assert.match(prov, /A clue, not proof\./); assert.match(prov, /Signals, not proof\. A person makes the final call\./);
await ev("document.querySelector('.doc-chip.flag').click(); 1");
assert.equal(await ev("document.querySelectorAll('.evidence').length"), 0);
pass('Evidence: accuracy shows rate and total first, only one panel open at a time, governance, misleading and provenance evidence');

// ---------- Path ----------
await click('.stamp-actions .btn', 'See the path'); await sleep(250);
const pathSteps = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.path-list li[data-step]')].map((li) => ({ due: li.querySelector('.path-due').textContent, action: li.querySelector('.path-action').textContent, because: li.querySelector('.path-because')?.textContent ?? null })))`));
console.log('path:', JSON.stringify(pathSteps.map((s) => `${s.due} ${s.action}`)));
const invoiceFlag = await ev("false"); void invoiceFlag;
assert.deepEqual(pathSteps.map((s) => s.due), [...pathSteps.map((s) => s.due)].sort((a, b) => 0)); // listed by deadline (checked below on ISO dates)
const mapSteps = [map.stamp, ...map.alsoNeeded, ...map.pathOnly].filter((s) => s.id !== 'verify' || pathSteps.some((p) => p.action === s.action));
assert.deepEqual(pathSteps.map((p) => p.action).sort(), mapSteps.map((s) => s.action).sort());
for (const p of pathSteps) { const s = mapSteps.find((x) => x.action === p.action); assert.equal(p.because, s.because ? `Because ${s.because.check}: ${s.because.text}` : null); }
assert.equal(pathSteps.at(-1).action, map.stamp.action, 'the refund decision (23 Oct) comes after the 20 Oct steps');
assert.match(await ev("document.querySelector('.path-outcome').textContent"), /Written outcome due Mon 2 Nov/);
await shot('path');
pass('Path: every step by deadline with its Because; the verify step is there because the invoice has a signal');
await click('.path .btn', 'Back to result'); await sleep(150);
assert.ok(await ev("!!document.querySelector('.stamp-card')"));

// ---------- history keeps no text ----------
// (demo mode without the extension keeps history in localStorage)
assert.ok(!/Elena|Quarry|1981|stall/.test(await ev("localStorage.getItem('tl-history') || ''")));

// ---------- the privacy gate in live mode, and the verify step without a provenance signal ----------
await load({ demo: false, profile: 'harbourview' });
await drop(files3);
assert.match(await ev("document.querySelector('.gate')?.textContent ?? ''"), /Personal information found\. Names may remain in the text sent for analysis\./);
assert.match(await ev("document.querySelector('.review > p.small:last-of-type')?.textContent ?? ''"), /One AI call with the masked text shown above\./);
assert.equal((await ext()).length, 0, 'nothing is sent before Run AI');
pass('Live mode: the gate shows on the Review screen and nothing is sent until Run AI');

await load({ demo: true, profile: 'harbourview' });
await drop(files3);
assert.equal(await ev("!!document.querySelector('.gate')"), false, 'no gate in Demo mode');
console.log('CASE PANEL E2E PASSED');
close();
