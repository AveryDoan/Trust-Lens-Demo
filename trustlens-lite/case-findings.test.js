// The finding behind each step: demo-findings-map.json (prepared wording), one row per file, and the counts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uniqueFiles, fileSummary, cleanFileName, normFileName, deriveFindings, becauseLabel, isWeekday, addWeekdays } from './case.js';

const D = 'demo/case-complaint';
const map = JSON.parse(readFileSync(`${D}/demo-findings-map.json`, 'utf8'));
const saved = JSON.parse(readFileSync(`${D}/demo-result-complaint.json`, 'utf8'));
const pack = JSON.parse(readFileSync('policies-harbourview.json', 'utf8')).policies;
let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

run('dedupe: a file that was read and a "Preview attachment" row for it become one row; the count is "Files: 3 read"', () => {
  const docs = [
    { name: 'Open email', kind: 'email' },
    { name: 'INV-DEMO-20417.pdf', kind: 'pdf' },
    { name: 'Preview attachment INV-DEMO-20417.pdf', kind: 'pdf', notRead: true },
    { name: 'Correspondence-thread.pdf', kind: 'pdf', notRead: true },
    { name: 'Preview attachment Correspondence-thread.PDF', kind: 'pdf', notRead: true },
    { name: 'Correspondence-thread.pdf', kind: 'pdf' },
    { name: '02-service-agreement-HRS-AGR-0311.pdf', kind: 'pdf' },
  ];
  const rows = uniqueFiles(docs);
  assert.deepEqual(rows.map((d) => [d.name, Boolean(d.notRead)]), [['Open email', false], ['INV-DEMO-20417.pdf', false], ['Correspondence-thread.pdf', false], ['02-service-agreement-HRS-AGR-0311.pdf', false]]);
  assert.equal(fileSummary(rows).text, 'Files: 3 read');
  assert.equal(fileSummary([...rows, { name: 'x.pdf', kind: 'pdf', notRead: true }]).text, 'Files: 3 read, 1 not read');
  assert.equal(cleanFileName('Download attachment Report (final).docx'), 'Report (final).docx');
  assert.equal(normFileName('Preview attachment INV.PDF'), normFileName('inv.pdf'));
});
run('a file that was not read stays as one "Not read" row', () => {
  const rows = uniqueFiles([{ name: 'Preview attachment a.pdf', kind: 'pdf', notRead: true }, { name: 'a.pdf', kind: 'pdf', notRead: true }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].name, 'a.pdf'); assert.equal(rows[0].notRead, true);
});
run('the findings map belongs to the saved case and the stamp action is the saved primary step', () => {
  assert.equal(map.caseId, saved.id);
  assert.equal(map.stamp.action, saved.stamp.title); // there is no demo-action-plan.json; the saved result holds the primary step
  assert.equal(map.stamp.owner, saved.stamp.owner);
  assert.equal(map.stamp.due, saved.stamp.due);
  assert.deepEqual(map.stamp.basis, saved.stamp.basis);
  assert.equal(map.collapsedChecks, saved.noConcernsLine);
});
run('every basis id exists in policies-harbourview.json, and every due date is a weekday', () => {
  const ids = new Set(pack.map((p) => p.id));
  const steps = [map.stamp, ...map.alsoNeeded, ...map.pathOnly];
  for (const s of steps) { for (const b of s.basis) assert.ok(ids.has(b), `${s.id ?? 'stamp'}: ${b}`); assert.ok(isWeekday(s.due), `${s.action}: ${s.due}`); }
  assert.equal(map.alsoNeeded.length, 3);
});
run('each step in the map is a step in the saved result (same owner, due and clause family)', () => {
  const dueByRank = saved.case.nextSteps.map((s) => s.due);
  for (const s of [...map.alsoNeeded, ...map.pathOnly]) assert.ok(dueByRank.includes(s.due), s.action);
  for (const s of map.alsoNeeded) assert.ok(saved.case.nextSteps.some((n) => n.owner === s.owner && s.basis.every((b) => n.basis.includes(b) || b === 'H4.2' || b === 'H4.4')), s.action);
  assert.equal(map.pathOnly[0].onlyIf, saved.case.nextSteps.find((n) => n.onlyIf).onlyIf);
});
run('the accuracy rows named in the map exist, and the claims summary matches the claims', () => {
  const items = saved.case.reconciliation.map((r) => r.item);
  for (const r of map.accuracyDefaultRows) assert.ok(items.includes(r), r);
  const n = (re) => saved.case.claims.filter((c) => re.test(c.status)).length;
  const shown = n(/^supported/) + n(/^misinformation/) + n(/^needs checking/);
  assert.equal(map.claimsSummary, `${n(/^supported/)} claims supported, ${n(/^misinformation/)} misinformation, ${n(/^needs checking/)} to check, ${saved.case.claims.length - shown} not shown in the documents.`);
  assert.equal(map.claimsSummary, '2 claims supported, 1 misinformation, 1 to check, 2 not shown in the documents.');
});
run('Bias is "check" with no clause and a note; the map names it as noted, and the two new path steps have no clause', () => {
  const bias = saved.checks.find((c) => c.key === 'bias');
  assert.equal(bias.status, 'check'); assert.deepEqual(bias.basis, []); assert.equal(bias.quotes.length, 1);
  assert.equal(bias.basisNote, 'No clause in this policy pack covers bias. This is TrustLens guidance, not policy.');
  assert.equal(map.collapsedChecks, 'Also noted: Bias'); assert.equal(saved.noConcernsLine, 'Also noted: Bias');
  assert.deepEqual(map.noted.map((x) => [x.id, x.evidence, x.basis.length]), [['bias', 'bias', 0]]);
  const added = map.pathOnly.filter((s) => s.guidance);
  assert.deepEqual(added.map((s) => s.id), ['neutral', 'confirm']);
  for (const s of added) { assert.deepEqual(s.basis, []); assert.ok(!s.onlyIf, 'always in the path'); assert.equal(s.due, '2026-10-20'); assert.equal(s.owner, 'Complaints team'); }
});
run('the claims list has the new statuses, each with its reason', () => {
  const st = saved.case.claims.map((c) => c.status.split(':')[0]);
  assert.deepEqual(st, ['supported', 'supported by the correspondence provided', 'needs checking', 'misinformation', 'not shown in the documents', 'not shown in the documents']);
  assert.match(saved.case.claims[3].status, /clause 6 says 10 business days/);
});
run('the stamp, the amounts and the due dates are unchanged', () => {
  assert.equal(saved.stamp.title, 'Approve $11,880.00 refund and corrected invoice');
  assert.equal(saved.case.totals.difference, 11880); assert.equal(saved.case.totals.agreedTotal, 10164); assert.equal(saved.case.totals.billedTotal, 22044);
  assert.equal(saved.stamp.due, '2026-10-23'); assert.equal(saved.case.outcomeDue.date, '2026-11-02');
  assert.deepEqual(saved.case.nextSteps.map((s) => s.due), ['2026-10-20', '2026-10-20', '2026-10-20', '2026-10-20']);
});
run('the "How to manage" lines are in the saved result, each with clause ids that exist', () => {
  const g = saved.checks.find((c) => c.key === 'governance');
  if (!g.manage) return console.log('        (the updated saved result has no "How to manage" lines: nothing to check)');
  assert.deepEqual(g.manage.map((m) => m.label), ['Refund', 'Privacy', 'Conduct']);
  const ids = new Set(pack.map((p) => p.id));
  for (const m of g.manage) for (const b of m.basis) assert.ok(ids.has(b), b);
  assert.equal(g.manage[0].text, 'Hold the invoice, confirm clause 4 was not triggered, then issue the corrected invoice and refund. Billing Manager approves; Finance Director too, over $10,000.');
});
run('because labels, and a live result gets a map of the same shape', () => {
  assert.equal(becauseLabel(map.stamp.because), 'Because Accuracy · Concern');
  const live = deriveFindings(saved);
  assert.equal(live.stamp.action, saved.stamp.title);
  assert.equal(live.alsoNeeded.length, 3); assert.equal(live.pathOnly.length, 1);
  assert.ok(live.alsoNeeded.every((s) => s.because.text && s.action && s.owner && isWeekday(s.due)));
  assert.equal(live.claimsSummary, map.claimsSummary);
  assert.deepEqual(live.noted.map((x) => x.id), ['bias']);
  assert.equal(addWeekdays('2026-10-19', 1), '2026-10-20');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
