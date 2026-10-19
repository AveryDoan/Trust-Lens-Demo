// Arithmetic and date checks on the prepared result in demo/case-complaint/demo-result-complaint.json.
// The JSON is read, never changed. Everything here is recomputed from its own values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('demo/case-complaint/demo-result-complaint.json', 'utf8'));
const cents = (n) => Math.round(n * 100);
const isWeekday = (iso) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };
// Weekdays after a start date, ignoring public holidays (as the JSON's dueDateNote says).
const addWeekdays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if ([1, 2, 3, 4, 5].includes(d.getUTCDay())) n--; } return d.toISOString().slice(0, 10); };

let failed = 0;
const run = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '-', e.message); } };

run('totals: 22044 - 10164 = 11880', () => {
  assert.equal(cents(r.case.totals.billedTotal) - cents(r.case.totals.agreedTotal), cents(r.case.totals.difference));
  assert.equal(r.case.totals.difference, 11880);
  assert.equal(r.stamp.title, 'Approve $11,880.00 refund and corrected invoice');
});
run('every reconciliation difference equals billed minus agreed', () => {
  for (const x of r.case.reconciliation) assert.equal(cents(x.billed) - cents(x.agreed), cents(x.difference), x.item);
});
run('GST is 10% of each subtotal, and total = subtotal + GST', () => {
  const by = Object.fromEntries(r.case.reconciliation.map((x) => [x.item, x]));
  for (const side of ['agreed', 'billed']) {
    const sub = by['Subtotal (ex GST)'][side], gst = by['GST (10%)'][side], total = by['Total (incl GST)'][side];
    assert.equal(cents(gst), Math.round(cents(sub) / 10), `${side} GST`);
    assert.equal(cents(sub) + cents(gst), cents(total), `${side} total`);
  }
  assert.equal(cents(r.case.totals.agreedTotal), cents(by['Total (incl GST)'].agreed));
  assert.equal(cents(r.case.totals.billedTotal), cents(by['Total (incl GST)'].billed));
});
run('rate x 2,400 boxes gives the subtotals', () => {
  const by = Object.fromEntries(r.case.reconciliation.map((x) => [x.item, x]));
  assert.equal(cents(by['Rate per box (ex GST)'].agreed) * 2400, cents(by['Subtotal (ex GST)'].agreed));
  assert.equal(cents(by['Rate per box (ex GST)'].billed) * 2400, cents(by['Subtotal (ex GST)'].billed));
});
run('every nextSteps due date, the stamp due date and the outcome date are weekdays', () => {
  for (const s of r.case.nextSteps) assert.ok(isWeekday(s.due), `${s.action}: ${s.due}`);
  assert.ok(isWeekday(r.stamp.due)); assert.ok(isWeekday(r.case.outcomeDue.date));
});
run('due dates recompute from Mon 19 Oct 2026 (weekdays, holidays ignored)', () => {
  assert.equal(new Date('2026-10-19T00:00:00Z').getUTCDay(), 1);
  assert.equal(addWeekdays('2026-10-19', 1), '2026-10-20');
  assert.equal(addWeekdays('2026-10-19', 4), r.stamp.due);
  assert.equal(addWeekdays('2026-10-19', 10), r.case.outcomeDue.date);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
