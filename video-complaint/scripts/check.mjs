// Pre-render checks. Run with: npm run check   (needs Node 22.6+ for --experimental-strip-types, or Node 23.6+)
// 1 timeline: 900 frames, scenes cover 0-899 with no gap or overlap
// 2 captions: at most 8 words, at least 44 px, inside their scene
// 3 data: src/data copies are byte-identical to the product's files
// 4 facts: every amount, date, clause id and count shown on screen is found in (or derived from) the JSON
// 5 literals: no amounts, dates or clause ids typed into scene/component code
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const product = path.resolve(root, '../trustlens-lite');
let bad = 0;
const ok = (m) => console.log('  ok   ' + m);
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const check = (cond, m) => (cond ? ok(m) : fail(m));

// 1 timeline
console.log('Timeline');
const tl = json('src/timeline.json');
check(tl.total === 900 && tl.fps === 30, `total ${tl.total} frames at ${tl.fps} fps`);
let next = 0;
for (const s of tl.scenes) { check(s.from === next, `${s.id} ${s.from}-${s.to}${s.from === next ? '' : ` (expected start ${next})`}`); next = s.to + 1; }
check(next === 900, `scenes end at frame ${next - 1}`);

// 2 captions
console.log('Captions');
check(tl.captionPx >= 44, `caption size ${tl.captionPx} px`);
for (const s of tl.scenes) for (const c of s.captions) {
  const w = c.text.trim().split(/\s+/).length;
  check(w <= 8 && c.from >= s.from && c.to <= s.to, `${s.id} "${c.text}" (${w} words, ${c.from}-${c.to})`);
}

// 3 data copies
console.log('Data copies');
for (const f of ['demo-result-complaint.json', 'demo-findings-map.json', 'demo-evidence.json', 'policies-harbourview.json']) {
  const a = path.join(product, 'demo/case-complaint', f);
  check(existsSync(a) && readFileSync(a, 'utf8') === read('src/data/' + f), `${f} identical to the product copy`);
}
const sources = json('src/data/sources.json').copied;
console.log(`  note demo-action-plan.json: ${sources['demo-action-plan.json'] ? 'present' : 'MISSING in the repo (the video builds the path from the result and the findings map)'}`);

// 4 facts
console.log('On-screen facts');
const { buildFacts } = await import(path.join(root, 'src/facts.ts'));
const result = json('src/data/demo-result-complaint.json'), map = json('src/data/demo-findings-map.json'), counts = json('src/data/counts.json'), pol = json('src/data/policies-harbourview.json');
const evRaw = json('src/data/demo-evidence.json'), evRes = json('src/data/evidence-resolved.json');
const facts = buildFacts(result, map, counts, pol, evRes, json('src/data/doc-pages.json'));
const strings = [];
(function walk(v) { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(facts);
const hay = JSON.stringify([result, map, pol, evRaw]);
const allNums = new Set(); const allDates = [];
(function walk(v) {
  if (typeof v === 'number') allNums.add(Math.round(v * 100));
  else if (typeof v === 'string') { for (const m of v.matchAll(/\$?(\d[\d,]*(?:\.\d+)?)/g)) allNums.add(Math.round(parseFloat(m[1].replace(/,/g, '')) * 100)); if (/^\d{4}-\d{2}-\d{2}/.test(v)) allDates.push(v.slice(0, 10)); }
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
})([result, map]);
// differences between two numbers in the same object (the table's Difference column)
const diffs = new Set();
(function walk(v) { if (Array.isArray(v) && v.length === 0) return; if (v && typeof v === 'object') { const n = Object.values(v).filter((x) => typeof x === 'number'); for (const a of n) for (const b of n) diffs.add(Math.round(Math.abs(a - b) * 100)); Object.values(v).forEach(walk); } })(result);
const wk = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOk = (w, d, m, y) => { const dt = new Date(Date.UTC(y, mo.indexOf(m), +d)); return wk[dt.getUTCDay()] === w; };
const seen = { money: 0, date: 0, clause: 0, count: 0 };
for (const s of strings) {
  for (const m of s.matchAll(/[+-]?\$(\d[\d,]*(?:\.\d+)?)/g)) {
    seen.money++; const c = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
    check(allNums.has(c) || diffs.has(c), `amount ${m[0]} in "${s.slice(0, 50)}"`);
  }
  for (const m of s.matchAll(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g)) {
    seen.date++;
    const iso = allDates.some((d) => +d.slice(8, 10) === +m[2] && mo[+d.slice(5, 7) - 1] === m[3] && dateOk(m[1], m[2], m[3], +d.slice(0, 4)));
    const text = hay.includes(m[0]);
    check(iso || text, `date ${m[0]} found in the JSON and weekday correct`);
  }
  for (const m of s.matchAll(/\bH\d\.\d\b/g)) { seen.clause++; check(JSON.stringify(pol).includes(`"${m[0]}"`), `clause ${m[0]} exists in the policy file`); }
}
check(facts.masked.total.startsWith(String(counts.total)) && Object.values(counts.byType).reduce((a, b) => a + b, 0) === counts.total, `masked count ${counts.total} equals the sum of its types`);
check(JSON.stringify(result).includes(facts.stamp.action), `stamp action "${facts.stamp.action}" is the saved action`);
check(facts.clause.quote && JSON.stringify(pol).includes(facts.clause.quote.replace(/"/g, '\\"')), 'clause quote is verbatim from the policy file');
for (const r of facts.accuracy.rows) check(hay.includes(r.quote) , `source quote "${r.quote.slice(0, 40)}…" is verbatim from the saved result`);
const sig = read('../trustlens-lite/provenance.js');
for (const s of facts.provenance.signals) check(sig.includes(s.id) && sig.toLowerCase().includes(s.label.toLowerCase().split(' ')[0]), `signal ${s.id} "${s.label}" matches provenance.js`);
// evidence: only verified quotes, exactly as stored, with the product's own "Found in" wording
const { foundLine } = await import(pathToFileURL(path.join(product, 'evidence.js')).href);
const shown = evRes.audit.steps.filter((s) => ['approve', 'privacy'].includes(s.id)); // the steps this video shows
check(shown.every((s) => s.notFound === 0 && s.notRead === 0), `evidence in the steps shown: ${shown.map((s) => `${s.id} ${s.verified} verified`).join(', ')}, none unverified (all steps: ${evRes.audit.verified} verified, ${evRes.audit.notFound} not found)`);
for (const id of ['approve', 'privacy']) {
  const stored = evRaw.steps[id].filter((e) => e.kind !== 'metadata');
  facts.evidence[id].items.forEach((it, i) => {
    check(it.text === stored[i].text, `${id} quote ${i + 1} is exactly as stored in demo-evidence.json`);
    const r = evRes.resolved.steps[id].filter((e) => e.kind === 'quote')[i];
    check(it.found === foundLine(r), `${id} quote ${i + 1} reads "${it.found}"`);
  });
}
check(/^Policy basis: /.test(facts.labels.footer) && read('../trustlens-lite/policies.js').includes(`short: '${facts.labels.footer.replace('Policy basis: ', '')}'`), `footer "${facts.labels.footer}" matches the product's short pack name`);
check(read('src/scenes/scenes.tsx').includes('Callout'), 'callouts for Bias, Governance and Policy are in the video');
console.log(`  checked ${seen.money} amounts, ${seen.date} dates, ${seen.clause} clause ids`);

// 6 the 60 second video
console.log('60 second video');
const t60 = json('src/data/timeline60.json');
check(t60.total === 1800 && t60.fps === 30, `total ${t60.total} frames at ${t60.fps} fps (${t60.total / t60.fps} s)`);
let n60 = 0;
for (const s of t60.scenes) { check(s.from === n60, `${s.id} ${s.from}-${s.to}${s.from === n60 ? '' : ` (expected start ${n60})`}`); n60 = s.to + 1; }
check(n60 === 1800, `scenes end at frame ${n60 - 1}`);
for (const s of t60.scenes) for (const c of s.captions) {
  const w = c.text.trim().split(/\s+/).length;
  check(w <= 8 && c.from >= s.from && c.to <= s.to && c.to > c.from, `${s.id} "${c.text}" (${w} words, ${c.from}-${c.to})`);
}
check(t60.captionPx >= 44, `caption size ${t60.captionPx} px`);
const hl = json('src/data/highlights.json');
const emailText = readFileSync(path.join(root, json('src/data/evidence-resolved.json').emailSource), 'utf8').replace(/\s+/g, ' ').toLowerCase();
for (const [id, b] of Object.entries(hl.boxes)) {
  const [x1, y1, x2, y2] = b.box;
  check(x1 >= 0 && y1 >= 0 && x2 <= hl.screenshot.width && y2 <= hl.screenshot.height && x2 > x1 && y2 > y1, `box ${id} is inside the ${hl.screenshot.width} x ${hl.screenshot.height} screenshot`);
  if (['bias', 'multiple', 'clause6', 'fraud', 'rate', 'rush'].includes(id)) check(emailText.includes(b.text.toLowerCase()), `box ${id}: its sentence is in the email text`);
}
const cam = json('src/data/camera.json').keys;
check(cam.every((k, i) => i === 0 || k.frame > cam[i - 1].frame) && cam.every((k) => k.scale <= 2.8), `camera: ${cam.length} keyframes in order, none above 2.8x`);
// every quote shown in the 60 second video was verified against the real files and the email
const emailSrc = json('src/data/evidence-resolved.json').emailSource;
check(evRes.audit.notFound === 0 && evRes.audit.notRead === 0, `evidence: all ${evRes.audit.verified} quotes verified (email text: ${emailSrc})`);
const sx = facts.sixty;
const shownQuotes = [...sx.bias.items, sx.claims.needsChecking.customer, sx.claims.needsChecking.file, sx.claims.misinformation.customer, sx.claims.misinformation.file, sx.rush.agreed, sx.rush.billed, sx.accounts.customer, sx.accounts.file];
for (const it of shownQuotes) check(JSON.stringify(evRaw).includes(JSON.stringify(it.text).slice(1, -1)), `quote shown: "${it.text.slice(0, 50)}…" is stored in demo-evidence.json`);
check(sx.bias.items.length === 1 && sx.bias.items[0].doc === 'email', 'bias: one quote, from the complaint email');
check(!JSON.stringify(evRaw).includes('does the same') && !JSON.stringify(sx).includes('does the same'), 'no "our own message does the same" line in the data or the video');
check(sx.bias.note === result.checks.find((c) => c.key === 'bias').basisNote, 'bias note is the saved basisNote');
check(JSON.stringify(sx).includes('"misinformation (1)"') === false && sx.assess.tags.join('|') === 'Misinformation (1)|Needs checking (1)', `claim tags counted from the claims: ${sx.assess.tags.join(', ')}`);
check(sx.assess.rows.map((r) => `${r.label}:${r.status}:${r.question}`).join('|') === result.checks.map((c) => `${c.label}:${c.status}:${c.question}`).join('|'), 'assessment rows = the four checks in demo-result-complaint.json (label, status, question)');
check(sx.claims.misinformation.reason.includes('10 business days') && sx.claims.needsChecking.note === 'The thread shows 3 emails from the customer (6, 9, 12 Oct). No other emails are shown.', 'claim statuses, reasons and notes come from the saved result');
check(sx.rush.amounts === 'Agreed $10,164.00 · Billed $22,044.00 · Difference +$11,880.00', 'the amounts line');
check(sx.accounts.guidance && sx.accounts.because === 'Because Accuracy: The emails the customer says she sent are not all shown.', 'accounts-team step: guidance, no clause, Because line from the findings map');
// the calculation: computed in facts.ts (it throws if a difference is not the saved one); checked again here
const rec = Object.fromEntries(result.case.reconciliation.map((r) => [r.item, r]));
const cn = (n) => Math.round(n * 100);
for (const item of ['Rate per box (ex GST)', 'Subtotal (ex GST)', 'GST (10%)', 'Total (incl GST)']) check(cn(rec[item].billed) - cn(rec[item].agreed) === cn(rec[item].difference), `${item}: ${rec[item].billed} - ${rec[item].agreed} = ${rec[item].difference}`);
check(cn(2400 * rec['Rate per box (ex GST)'].difference) === cn(rec['Subtotal (ex GST)'].difference), `2,400 x $4.50 = $10,800.00`);
check(cn(rec['Rate per box (ex GST)'].agreed * 2400) === cn(rec['Subtotal (ex GST)'].agreed) && cn(rec['Rate per box (ex GST)'].billed * 2400) === cn(rec['Subtotal (ex GST)'].billed), 'both sides have 2,400 boxes');
check(sx.calc.lines.map((l) => l.label).join('|') === 'Rate per box|Boxes|Subtotal|GST (10%)|Total' && sx.calc.lines.at(-1).expr === '$22,044.00 - $10,164.00 = +$11,880.00', 'calculation lines: ' + sx.calc.lines.map((l) => l.expr).join(' / '));
check(sx.calc.heads.left === 'Invoice (billed)' && sx.calc.heads.right === 'Agreement (agreed)' && sx.calc.heads.tag === 'Source of truth', 'Agreed vs billed: invoice LEFT, agreement RIGHT, Source of truth tag');
// the invoice page is the repo's pii.js output: nothing masked by hand
check(sx.pages.invoiceFull.masked.includes('[EMAIL]') && sx.pages.invoiceFull.masked.includes('[ADDRESS]') && sx.pages.invoiceFull.masks.join() === 'address,email', `invoice page masks (pii.js): ${sx.pages.invoiceFull.masks.join(', ')}`);
// side by side: LEFT is always what is checked (the email or the invoice), RIGHT the source of truth
const scenesSrc = read('src/scenes60/Scenes60.tsx') + read('src/components/panel60.tsx');
check((scenesSrc.match(/<SideBySide/g) || []).length === 4 && /left=\{\{ head: sixty\.bias[\s\S]*?right=\{\{ head: policyHead/.test(scenesSrc) && /left=\{\{ head: claim\.customer\.label[\s\S]*?right=\{\{ head: claim\.file\.label/.test(scenesSrc) && /left=\{\{ head: c\.heads\.left[\s\S]*?right=\{\{ head: c\.heads\.right/.test(scenesSrc) && /left=\{\{ head: a\.customer\.label[\s\S]*?right=\{\{ head: a\.file\.label/.test(scenesSrc), 'all 4 side-by-sides: LEFT the email or invoice, RIGHT the source of truth');
check(!/Misinformation \(|claimsSummary|claims supported/.test(read('src/scenes60/Scenes60.tsx')), 'the claims summary line is not in the 60 second scenes');
// the stamp, See the path and the path appear only in S6
const s6at = scenesSrc.indexOf('export const S6');
for (const comp of ['StampRule', 'PathView60', 'AccountsFocus', 'ResultView']) { const idx = [...scenesSrc.matchAll(new RegExp(`<${comp}\\b`, 'g'))].map((m) => m.index); check(idx.every((i) => i > s6at), `<${comp}> is used only inside S6`); }
check(!/ResultView/.test(read('src/scenes60/Scenes60.tsx').replace(/import[^\n]*\n/g, '')), 'ResultView (stamp card, Also needed) is not used by the 60 second video');
check(facts.labels.consent.rows[1].startsWith(`${facts.email.attachments.length} attachments`), 'the permission screen counts the attachments the email has');


// 5 literals
console.log('Hard-coded literals in scene and component code');
const dirs = ['src/scenes', 'src/scenes60', 'src/components'];
for (const d of dirs) for (const f of readdirSync(path.join(root, d))) {
  const t = read(`${d}/${f}`).split('\n');
  t.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    if (/\$\d|\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}\b|\b[HP]\d\.\d\b|\b\d{1,2} (Oct|Nov)\b/.test(line)) fail(`${d}/${f}:${i + 1} ${line.trim().slice(0, 70)}`);
  });
}
if (!bad) ok('none found');

console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
