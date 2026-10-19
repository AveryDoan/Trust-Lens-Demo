// Gmail reader tests. Pure helpers run in Node; the DOM parts run in headless Chrome against tests/fixtures/gmail-complaint.html.
// Run: node tests/gmail-reader.test.mjs   (set CHROME=/path/to/chrome if Chrome is not in /Applications)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { launch } from './cdp.mjs';
import { detectRole } from '../case.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'gmail-reader.js')).href);
const G = globalThis.__tlGmail;
const readerSource = readFileSync(path.join(root, 'gmail-reader.js'), 'utf8');
let failed = 0;
const run = async (name, fn) => { try { await fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

// ---------- pure helpers ----------
await run('date parsing: Gmail title formats, 12 and 24 hour, and no date', () => {
  assert.deepEqual(G.parseGmailDate('Mon, 19 Oct 2026, 20:57'), { iso: '2026-10-19', time: '20:57' });
  assert.deepEqual(G.parseGmailDate('Mon, Oct 19, 2026, 8:57 PM'), { iso: '2026-10-19', time: '20:57' });
  assert.deepEqual(G.parseGmailDate('Mon, Oct 19, 2026, 12:05 AM'), { iso: '2026-10-19', time: '00:05' });
  assert.deepEqual(G.parseGmailDate('19 October 2026 at 09:30'), { iso: '2026-10-19', time: '09:30' });
  assert.deepEqual(G.parseGmailDate('Date: 3 March 2026'), { iso: '2026-03-03', time: '' });
  assert.equal(G.parseGmailDate('20:57 (34 minutes ago)'), null);
  assert.equal(G.parseGmailDate(''), null);
});
await run('download_url attribute: mime:name:url, with colons inside the url', () => {
  assert.deepEqual(G.parseDownloadUrlAttr('application/pdf:INV-DEMO-20417.pdf:https://mail.google.com/mail/u/0/?view=att&attid=0.1'), { mime: 'application/pdf', name: 'INV-DEMO-20417.pdf', url: 'https://mail.google.com/mail/u/0/?view=att&attid=0.1' });
  assert.equal(G.parseDownloadUrlAttr('nonsense'), null);
});
await run('account matching is exact on the address, case-insensitive, and refuses an empty expected address', () => {
  assert.equal(G.matchAccount('demo.tester@example.com', 'Demo.Tester@example.com '), true);
  assert.equal(G.matchAccount('someone.else@example.com', 'demo.tester@example.com'), false);
  assert.equal(G.matchAccount('demo.tester@example.com', ''), false);
  assert.equal(G.matchAccount('', 'demo.tester@example.com'), false);
  assert.equal(G.firstEmail('Google Account: Demo Tester  (demo.tester@example.com)'), 'demo.tester@example.com');
});
await run('role by content: the complaints procedure PDF text is "policy", never "agreement"', () => {
  const policy = 'Customer Complaints, Billing and Privacy Procedure Harbourview Records Services Pty Ltd. Version 1.0 1. Complaints 2. Billing accuracy 2.1 An invoice must match the signed service agreement.';
  assert.equal(detectRole(policy).role, 'policy');
  const agreement = 'Managed Records Digitisation Agreement Agreement reference: HRS-AGR-0311 Parties 3. Price 4. Rush tier ... clause 3 Signatures';
  assert.notEqual(detectRole(agreement).role, 'policy');
});

// ---------- the DOM, in headless Chrome ----------
const fixture = pathToFileURL(path.join(root, 'tests/fixtures/gmail-complaint.html')).href;
const { send, ev, sleep, close } = await launch(9351, path.join(tmpdir(), 'tl-gmail-test-profile'));
try {
  await send('Page.enable');
  await send('Page.navigate', { url: fixture }); await sleep(600);
  await ev(readerSource);
  const call = (expr) => ev(`JSON.stringify(${expr})`).then(JSON.parse);
  const OK = `{ expected: 'demo.tester@example.com', today: '2000-01-01' }`;

  await run('account guard: a different account reads nothing; no expected address reads nothing', async () => {
    const wrong = await call(`__tlGmail.read({ expected: 'someone.else@example.com' })`);
    assert.deepEqual(wrong, { ok: false, reason: 'account-mismatch' });
    const none = await call(`__tlGmail.read({})`);
    assert.deepEqual(none, { ok: false, reason: 'no-expected-address' });
    const diag = await call(`__tlGmail.diagnostics({ expected: 'someone.else@example.com' })`);
    assert.equal(diag.accountMatch, 'no match'); assert.equal(diag.bodyStrategy, undefined);
  });
  await run('the account is read from the account button label, and from the page title as a fallback', async () => {
    assert.deepEqual(await call(`__tlGmail.account()`), { address: 'demo.tester@example.com', source: 'account button aria-label' });
    await ev(`document.querySelector('header').remove()`);
    assert.deepEqual(await call(`__tlGmail.account()`), { address: 'demo.tester@example.com', source: 'page title' });
    await send('Page.navigate', { url: fixture }); await sleep(500); await ev(readerSource);
  });
  await run('body: the open message only, with no quoted history, no collapsed earlier message', async () => {
    const r = await call(`__tlGmail.read(${OK})`);
    assert.equal(r.ok, true);
    assert.match(r.body, /^Dear Complaints team,/);
    assert.match(r.body, /I am formally complaining that Meridian Community Health Services was overcharged \$11,880 on invoice INV-DEMO-20417\./);
    assert.match(r.body, /Please call me on 0491 570 158\./);
    assert.match(r.body, /Chief Operating Officer, Meridian Community Health Services$/);
    assert.ok(!/QUOTED HISTORY|EARLIER COLLAPSED/.test(r.body));
    assert.equal(r.subject, 'Formal complaint: overcharged $11,880 on invoice INV-DEMO-20417 - response required by Friday');
    assert.deepEqual(r.sender, { name: 'Arden Trinh', address: 'arden.trinh@example.org' });
    assert.match(r.debug.join(' '), /body: \[data-message-id\] \+ div\.a3s/);
  });
  await run('date: the full timestamp from the date element title; then the body; then today', async () => {
    const r = await call(`__tlGmail.read(${OK})`);
    assert.deepEqual([r.date.iso, r.date.time, r.date.source], ['2026-10-19', '20:57', 'element title']);
    await ev(`document.querySelector('.g3').removeAttribute('title')`);
    const noDate = await call(`__tlGmail.read(${OK})`);
    assert.deepEqual([noDate.date.iso, noDate.date.source], ['2000-01-01', 'today (fallback)']); // a date merely mentioned in the text is not the sent date
    await ev(`document.querySelector('[data-message-id="#msg-f:1"] .a3s div[dir]').insertAdjacentHTML('beforeend', '<div>Date: 12 October 2026</div>')`);
    const labelled = await call(`__tlGmail.read(${OK})`);
    assert.deepEqual([labelled.date.iso, labelled.date.source], ['2026-10-12', 'body text']);
  });
  await run('chips: each strategy on its own, then all together', async () => {
    await send('Page.navigate', { url: fixture }); await sleep(500); await ev(readerSource);
    const only = (s) => call(`__tlGmail.read({ expected: 'demo.tester@example.com', strategies: ['${s}'] }).chips`);
    const a = await only('download_url');
    assert.deepEqual(a.map((c) => [c.name, c.size, Boolean(c.url)]), [['INV-DEMO-20417.pdf', '39 KB', true]]);
    const b = await only('view=att');
    assert.deepEqual(b.map((c) => [c.name, Boolean(c.url)]), [['habourview-complaints-procedure.pdf', true]]);
    const c = await only('dom chip');
    assert.ok(c.some((x) => x.name === 'Correspondence-thread.pdf' && !x.url && x.size === '44 KB'));
    const all = await call(`__tlGmail.read(${OK}).chips`);
    assert.deepEqual(all.map((x) => x.name).sort(), ['Correspondence-thread.pdf', 'INV-DEMO-20417.pdf', 'habourview-complaints-procedure.pdf']);
    assert.equal(all.find((x) => x.name === 'INV-DEMO-20417.pdf').strategies.includes('download_url'), true);
    assert.equal(all.find((x) => x.name === 'Correspondence-thread.pdf').url, '');
    assert.ok(all.every((x) => !/attachment/i.test(x.name)), '"Preview attachment" is not part of a file name');
    assert.equal(all.length, 3, 'a "Preview attachment x.pdf" chip is the same file as "x.pdf"');
  });
  await run('diagnostics print strategies and yes/no flags, and no message text', async () => {
    const d = await call(`__tlGmail.diagnostics({ expected: 'demo.tester@example.com' })`);
    assert.equal(d.accountMatch, 'match');
    assert.equal(d.chips.length, 3);
    assert.deepEqual(d.chips.map((x) => typeof x.urlPresent), ['boolean', 'boolean', 'boolean']);
    const text = JSON.stringify(d);
    assert.ok(!/Dear Complaints|Casey|overcharged|Meridian/.test(text), 'no message text in diagnostics');
  });
  await run('no open message: the reader says so instead of guessing', async () => {
    await ev(`document.querySelectorAll('[data-message-id]').forEach((e) => e.remove()); document.querySelectorAll('.a3s').forEach((e) => e.remove())`);
    const r = await call(`__tlGmail.read(${OK})`);
    assert.deepEqual(r, { ok: false, reason: 'no-open-message' });
  });
} finally { close(); }

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
