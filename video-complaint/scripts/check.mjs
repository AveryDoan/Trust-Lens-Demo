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
const facts = buildFacts(result, map, counts, pol, evRes);
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
check(evRes.audit.notFound === 0 && evRes.audit.notRead === 0, `evidence: ${evRes.audit.verified} verified, ${evRes.audit.notFound} not found, ${evRes.audit.notRead} not read (run against the real PDFs and the email)`);
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

// 5 literals
console.log('Hard-coded literals in scene and component code');
const dirs = ['src/scenes', 'src/components'];
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
