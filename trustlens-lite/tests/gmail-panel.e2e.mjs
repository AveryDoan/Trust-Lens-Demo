import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { launch } from './cdp.mjs';
// Run: python3 -m http.server 8765 (in trustlens-lite), then: node tests/gmail-panel.e2e.mjs
const P = process.argv[2] ?? process.cwd(); const C = P + '/demo/case-complaint/';
const { send, ev, sleep, close } = await launch(9353, tmpdir() + '/tl-gmail-e2e-profile');
await send('Page.enable'); await send('DOM.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const b64 = (f) => readFileSync(f).toString('base64');
const FILES = { 'attid=0.1': C + 'INV-DEMO-20417.pdf', 'attid=0.2': C + 'habourview-complaints-procedure.pdf' };
const DATA = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, b64(f)]));
const readerSrc = readFileSync(P + '/gmail-reader.js', 'utf8');
const stub = ({ enabled, address, fixture }) => `
window.__calls = []; window.__msgs = [];
window.__ready = new Promise((res) => document.addEventListener('DOMContentLoaded', () => { const f = document.createElement('iframe'); f.id = 'pg'; f.style.cssText = 'position:fixed;left:-2000px;width:900px;height:700px'; f.onload = () => res(); f.src = '${fixture}'; document.body.append(f); }));
const store = JSON.parse(localStorage.getItem('ext') || '{}');
window.chrome = {
  storage: { local: { async get(d) { const s = JSON.parse(localStorage.getItem('ext') || '{}'); return { ...d, ...s, demoMode: true, orgProfile: 'harbourview', gmailEnabled: ${enabled}, gmailAddress: '${address}' }; }, async set(o) { const s = JSON.parse(localStorage.getItem('ext') || '{}'); localStorage.setItem('ext', JSON.stringify({ ...s, ...o })); } },
             session: { async get() { return { pending: { text: '', tabId: 1, url: 'https://mail.google.com/mail/u/0/#inbox/abc' } }; } }, onChanged: { addListener() {} } },
  runtime: { openOptionsPage() {}, async sendMessage(m) { window.__msgs.push(m.url); const key = Object.keys(${JSON.stringify(DATA)}).find((k) => m.url.includes(k)); const D = ${JSON.stringify(DATA)}; return key ? { ok: true, status: 200, bytes: 1, type: 'application/pdf', base64: D[key] } : { ok: false, status: 404, error: 'HTTP 404' }; } },
  scripting: { async executeScript({ files, func, args }) { await window.__ready; const w = document.getElementById('pg').contentWindow; window.__calls.push(files ? 'inject' : 'call');
    if (files) { if (!w.__tlGmail) w.eval(${JSON.stringify(readerSrc)}); return [{ result: null }]; }
    return [{ result: w.eval('(' + func.toString() + ')').apply(null, args || []) }]; } },
};`;
let stubId = null;
async function load(opts, hash = '') {
  if (stubId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId });
  stubId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: stub(opts) })).identifier;
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8765/panel.html' + hash }); await sleep(1500);
  await ev('localStorage.clear(); 1');
}
const FIX = '/tests/fixtures/gmail-complaint.html';
const press = async () => { await ev("[...document.querySelectorAll('button')].find((b) => b.textContent === 'Use this email').click(); 1"); await sleep(2800); };
const OFF = 'Gmail reading is off for this account. Use a demo account.';

// A. toggle off: nothing is read
await load({ enabled: false, address: 'demo.tester@example.com', fixture: FIX });
assert.ok(await ev("!![...document.querySelectorAll('button')].find((b) => b.textContent === 'Use this email')"), 'the button shows on a Gmail page');
await press();
assert.equal(await ev("document.getElementById('gmail-status').textContent"), OFF);
assert.deepEqual(await ev('window.__calls'), [], 'toggle off: the page is not touched');
assert.deepEqual(await ev('window.__msgs'), []);
console.log('ok   toggle off reads nothing');

// B. toggle on, different account
await load({ enabled: true, address: 'someone.else@example.com', fixture: FIX });
await press();
assert.equal(await ev("document.getElementById('gmail-status').textContent"), OFF);
assert.deepEqual(await ev('window.__msgs'), [], 'no attachment was fetched');
assert.equal(await ev("document.querySelector('.review')"), null);
console.log('ok   a different account reads nothing, fetches nothing');

// C. toggle on, the demo account
await load({ enabled: true, address: 'demo.tester@example.com', fixture: FIX });
await press();
const rev = JSON.parse(await ev(`JSON.stringify({ summary: [...document.querySelectorAll('.review-summary')].map((p) => p.textContent), items: [...document.querySelectorAll('.files .file-row')].map((l) => ({ chip: l.querySelector('.role-chip').textContent, name: l.querySelector('.fname').textContent, drop: !!l.querySelector('button') })), msgs: window.__msgs, bar: document.querySelector('.bar').getBoundingClientRect().bottom, box: document.querySelector('.seebox').textContent })`));
console.log('review:', JSON.stringify(rev.items), '|', rev.summary.join(' | '));
assert.deepEqual(rev.items.map((i) => [i.chip, i.name]), [['Email', 'Open email'], ['Invoice', 'INV-DEMO-20417.pdf'], ['Policy', 'habourview-complaints-procedure.pdf'], ['Not read', 'Correspondence-thread.pdf']]);
assert.equal(rev.items.filter((i) => i.name === 'INV-DEMO-20417.pdf').length, 1, 'a "Preview attachment" chip is the same file: one row');
assert.equal(rev.items[3].drop, true); assert.ok(rev.items.slice(0, 3).every((i) => !i.drop), 'only a file that was not read gets a drop control');
assert.equal(rev.summary[0], 'Files: 2 read, 1 not read');
assert.equal(rev.msgs.length, 2, 'only chips with a link were fetched');
assert.ok(rev.bar <= 700, 'Run AI is visible without scrolling');
assert.ok(rev.box.includes('[PHONE]') && !rev.box.includes('0491 570 158'), 'the body is redacted in the review');
assert.ok(!/QUOTED HISTORY|EARLIER COLLAPSED/.test(rev.box));
console.log('ok   review lists exactly the files read, one row each, with roles, and a Not read row');

// Drop the missing attachment onto its row
const doc = await send('DOM.getDocument'); const n = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#slot-input' });
await ev("document.querySelector('.files .notread button').click(); 1");
await send('DOM.setFileInputFiles', { files: [C + 'Correspondence-thread.pdf'], nodeId: n.nodeId }); await sleep(1500);
const after = JSON.parse(await ev("JSON.stringify({ rows: [...document.querySelectorAll('.files .file-row')].map((l) => [l.querySelector('.role-chip').textContent, l.querySelector('.fname').textContent]), summary: document.querySelector('.review-summary').textContent })"));
console.log('after drop:', JSON.stringify(after));
assert.deepEqual(after.rows[3], ['Emails', 'Correspondence-thread.pdf']); assert.equal(after.summary, 'Files: 3 read');
console.log('ok   Drop file fills the row');

// Run AI: the case matches from the email body alone; no agreement was attached
await ev("[...document.querySelectorAll('.bar .btn')].find((b) => b.textContent === 'Run AI').click(); 1"); await sleep(4200);
const gread = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.read-head')].map((h) => h.textContent))`));
assert.equal(gread.length, 4, 'the email, the invoice, the policy and the thread were read');
assert.match(await ev("document.querySelector('.facts-list').textContent"), /Subject: Formal complaint: overcharged \$11,880/);
await ev("[...document.querySelectorAll('.reading .btn')].find((b) => b.textContent === 'Show recommendations').click(); 1"); await sleep(300);
const out = JSON.parse(await ev(`JSON.stringify({ action: document.querySelector('.stamp-action')?.textContent, chips: [...document.querySelectorAll('.doc-chip')].map((c) => c.textContent), note: document.querySelector('.agreement-note')?.textContent })`));
console.log('result:', JSON.stringify(out));
assert.equal(out.action, 'Approve $11,880.00 refund and corrected invoice');
assert.equal(out.note, 'Agreement not attached: amounts checked against the email only.');
assert.ok(out.chips.includes('Policy') && !out.chips.includes('Agreement'), 'the policy PDF is shown as Policy, never Agreement');
await ev("document.querySelector('.stamp-because').click(); 1"); await sleep(250);
const acc = JSON.parse(await ev(`JSON.stringify({ q: [...document.querySelectorAll('.evidence .qrow')].map((r) => r.textContent), note: [...document.querySelectorAll('.evidence p')].filter((p) => /Agreement not attached/.test(p.textContent)).length })`));
assert.ok(acc.q.length > 0 && acc.q.every((t) => t === 'Not verified from a document'), JSON.stringify(acc.q));
assert.equal(acc.note, 1);
await ev("document.querySelectorAll('.also-row button.because')[1].click(); 1"); await sleep(250);
const mis = await ev("[...document.querySelectorAll('.evidence .small.muted, .evidence blockquote')].map((e) => e.textContent)");
assert.ok(mis.includes('File not read') && !mis.some((t) => /written rush request/.test(t)), JSON.stringify(mis));
console.log('ok   missing agreement: note, "File not read" for the agreement quote, no saved agreement text');
// the open email is a source too: its quotes are verified against the message body
await ev("document.querySelector('.stamp-actions .btn').click(); 1"); await sleep(300);
await ev("document.querySelector('li[data-step=\"acknowledge\"] .ev-list .textlink').click(); 1"); await sleep(100);
const ack = await ev("document.querySelector('li[data-step=\"acknowledge\"]').innerText");
assert.match(ack, /✓ Found in Complaint email/); assert.match(ack, /I am formally complaining that Meridian Community Health Services was overcharged \$11,880 on invoice INV-DEMO-20417\./);
assert.match(await ev("document.querySelector('.path-callout').innerText"), /✓ Found in Complaint email[\s\S]*I first raised this on 6 October|I first raised this on 6 October[\s\S]*✓ Found in Complaint email/);
console.log('ok   Gmail path: the complaint-email quotes are verified against the message body');
const netcalls = await ev("(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => !n.startsWith(location.origin)))()");
assert.deepEqual(netcalls, [], 'no external request in Demo mode');
const hist = JSON.parse(await ev("localStorage.getItem('ext')")).history[0];
assert.ok(!/Dear Complaints|Elena|0491|lawyer/.test(JSON.stringify(hist)), 'nothing from the page is stored');

// D. fallbacks: no open message -> the text selected on the page -> the drop zone
await load({ enabled: true, address: 'demo.tester@example.com', fixture: '/tests/fixtures/gmail-complaint.html' });
await ev("(async () => { await window.__ready; const d = document.getElementById('pg').contentDocument; d.querySelectorAll('[data-message-id]').forEach((e) => e.remove()); const r = d.createRange(); const h = d.querySelector('h2'); h.textContent = 'Selected words for the fallback'; r.selectNodeContents(h); const s = d.defaultView.getSelection(); s.removeAllRanges(); s.addRange(r); })()");
await press();
const fb = JSON.parse(await ev(`JSON.stringify({ text: document.getElementById('text').value, msg: document.querySelector('#view').textContent })`));
console.log('fallback (selection):', fb.text, '|', fb.msg.slice(-90));
assert.equal(fb.text, 'Selected words for the fallback'); assert.match(fb.msg, /No open message was found\. Using the text you selected on the page\./);
await load({ enabled: true, address: 'demo.tester@example.com', fixture: '/tests/fixtures/gmail-complaint.html' });
await ev("(async () => { await window.__ready; document.getElementById('pg').contentDocument.querySelectorAll('[data-message-id]').forEach((e) => e.remove()); })()");
await press();
assert.match(await ev("document.getElementById('gmail-status').textContent"), /No open message was found\. Select the text on the page, or drop the downloaded attachments below\./);
assert.ok(await ev("!!document.getElementById('dropzone')"), 'the drop zone is still there');
console.log('ok   fallbacks: selected text, then the drop zone');
console.log('GMAIL E2E PASSED');
close();
