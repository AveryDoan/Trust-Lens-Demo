import { scanPii, countByType } from './pii.js';
import { overallAction } from './rules.js';
import { findDemoEntry, cacheKey, sha256Hex } from './demo.js';
import { extractFile, FileError, truncateAtWord, FILE_CHAR_LIMIT, formatSize } from './extract.js';
import { attachCitations, citationsFor, formatCitation, GUIDANCE_LABEL } from './cite.js';

const MAX_CHARS = 8000;
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const ext = typeof chrome !== 'undefined' && chrome.storage ? chrome : null;
const params = new URLSearchParams(location.hash.slice(1));
const PREVIEW = params.has('state'); // static preview from saved demo data, never touches the network

const ACTION_UI = {
  escalate: { tone: 'concern', icon: 'i-stop' },
  redact: { tone: 'concern', icon: 'i-redact' },
  revise: { tone: 'check', icon: 'i-pencil' },
  verify: { tone: 'check', icon: 'i-search' },
  restrict: { tone: 'accent', icon: 'i-lock' },
  approve: { tone: 'ok', icon: 'i-check' },
};
const STATUS_UI = {
  OK: { tone: 'ok', icon: 'i-check' },
  Check: { tone: 'check', icon: 'i-warn' },
  Concern: { tone: 'concern', icon: 'i-stop' },
};
const CHECKS = [['bias', 'Bias'], ['accuracy', 'Accuracy'], ['deception', 'Deception risk'], ['governance', 'Governance']];
const PII_WORDS = { email: 'email address', phone: 'phone number', tfn: 'tax file number', card: 'card number' };

// ---------- small DOM helpers (text only: nothing from the page or the model is ever parsed as HTML) ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}
function icon(id, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- storage (extension storage, or localStorage when previewed as a plain page) ----------
async function load(key, fallback) {
  if (ext) return (await ext.storage.local.get({ [key]: fallback }))[key];
  try { return JSON.parse(localStorage.getItem('tl-' + key)) ?? fallback; } catch { return fallback; }
}
async function save(key, value) {
  if (ext) return ext.storage.local.set({ [key]: value });
  try { localStorage.setItem('tl-' + key, JSON.stringify(value)); } catch { /* preview only */ }
}
async function getSettings() {
  return ext
    ? ext.storage.local.get({ endpoint: '', model: '', apiKey: '', demoMode: false })
    : { endpoint: '', model: '', apiKey: '', demoMode: true };
}

// ---------- state ----------
let runId = 0;
let current = null; // { view, decision, entryId, openKey }
let pageTabId = null;
let fileInfo = null; // { name, kind, size, chars } while the text in the box came from a file

const announce = (msg) => { $('live').textContent = msg; };
function show(...nodes) { $('view').replaceChildren(...nodes); }
function setInputVisible(visible) { $('input-section').hidden = !visible; }
function updateInputMeta() {
  const n = $('text').value.length;
  $('source').textContent = n ? `· ${n.toLocaleString()} characters` : '';
}
async function refreshDemoPill() {
  const { demoMode } = await getSettings();
  $('demo-pill').hidden = !(demoMode || PREVIEW);
}

// Passages to show for a citation. V1 expands to its four document-control rows.
const passages = (cite) => cite.parts ?? [{ document: cite.document, version: cite.version, section: cite.section, quote: cite.quote }];
const segments = (quote) => (quote ? quote.split(' … ') : []);

// ---------- views other than the report ----------
function renderEmpty() {
  const hasText = $('text').value.trim().length > 0;
  setInputVisible(true);
  $('input-wrap').open = true;
  show(h('section', { class: 'message' },
    hasText ? null : h('img', { class: 'empty-logo', src: 'icons/logo.png', alt: 'TrustLens' }),
    h('h2', {}, hasText ? 'Ready to check' : 'Nothing checked yet'),
    h('p', {}, hasText
      ? 'The text is below. Choose Run check to assess it.'
      : 'Select text on any page, right-click, and choose “Check with TrustLens”.'),
    hasText ? null : h('p', { class: 'muted' }, 'With nothing selected, the toolbar button checks the main text of the page.'),
    h('div', { class: 'dropzone', id: 'dropzone' },
      h('p', {}, 'Or drop a file here: PDF, Word (.docx), text or Markdown.'),
      h('button', { class: 'btn', type: 'button', onclick: chooseFile }, 'Choose file'),
      h('p', { class: 'small muted' }, 'Up to 5 MB. The file is read in your browser. Only masked text is sent for checking.')),
  ));
  announce(hasText ? 'Text received. Ready to check.' : 'Nothing checked yet.');
}

function renderLoading() {
  setInputVisible(false);
  show(h('section', { class: 'skeleton', 'aria-busy': 'true' },
    h('p', { class: 'loading-text' }, 'Checking. This usually takes under 10 seconds.'),
    h('div', { class: 'sk sk-stamp', 'aria-hidden': 'true' }),
    ...[0, 1, 2, 3].map(() => h('div', { class: 'sk-row', 'aria-hidden': 'true' },
      h('div', { class: 'sk sk-line short' }), h('div', { class: 'sk sk-line' }))),
  ));
  announce('Checking the text.');
}

function renderError(message, { file = false } = {}) {
  setInputVisible(true);
  show(h('section', { class: 'message is-error', role: 'alert' },
    h('h2', {}, file ? 'This file could not be checked' : 'The check did not finish'),
    h('p', {}, message),
    file ? null : h('p', {}, 'Check your settings and try again, or try demo mode to see a saved report.'),
    h('div', { class: 'actions' },
      file
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: chooseFile }, 'Choose another file')
        : [h('button', { class: 'btn btn-primary', type: 'button', onclick: tryDemo }, 'Try demo mode'),
           h('button', { class: 'btn', type: 'button', onclick: runCheck }, 'Try again')],
    ),
  ));
  announce('The check did not finish. ' + message);
}

// ---------- stamp (level 1) ----------
function renderStamp(result, report) {
  const ui = ACTION_UI[result.action];
  const area = h('span', { id: 'decision', style: 'display:contents' });
  const stamp = h('section', { class: `stamp tone-${ui.tone}`, 'aria-labelledby': 'stamp-label' },
    h('div', { class: 'stamp-head' }, icon(ui.icon), h('h2', { class: 'stamp-label', id: 'stamp-label' }, result.label)),
    h('p', { class: 'stamp-reason' }, report.stamp_reason || result.reason),
    h('div', { class: 'stamp-actions' }, area, h('span', { id: 'copy-flash', class: 'copy-status', role: 'status' }), renderMenu(result)),
  );
  renderDecision(area);
  return stamp;
}

function renderDecision(area = $('decision'), overriding = false) {
  if (!area) return;
  const d = current?.decision;
  if (d) {
    area.replaceChildren(
      h('span', { class: 'decision-note' }, d.kind === 'followed' ? 'Recorded: you followed the advice.' : `Recorded: you overrode the advice${d.reason ? ` (${d.reason})` : ''}.`),
      h('button', { class: 'btn', type: 'button', onclick: () => setDecision(null) }, 'Undo'),
    );
  } else if (overriding) {
    const input = h('input', { type: 'text', 'aria-label': 'Reason for overriding (optional)', placeholder: 'Reason for overriding (optional)', maxlength: '120' });
    area.replaceChildren(h('span', { class: 'override-form' }, input,
      h('span', { class: 'stamp-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => setDecision({ kind: 'overridden', reason: input.value.trim() }) }, 'Save override'),
        h('button', { class: 'btn', type: 'button', onclick: () => renderDecision(area) }, 'Cancel'))));
    input.focus();
  } else {
    area.replaceChildren(
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => setDecision({ kind: 'followed' }) }, 'Follow advice'),
      h('button', { class: 'btn', type: 'button', onclick: () => renderDecision(area, true) }, 'Override'),
    );
  }
}

async function setDecision(decision) {
  current.decision = decision;
  renderDecision();
  const history = await load('history', []);
  const entry = history.find((e) => e.id === current.entryId);
  if (entry) { entry.decision = decision; await save('history', history); }
}

// ---------- overflow menu ----------
function renderMenu(result) {
  const button = h('button', { class: 'icon-btn', type: 'button', id: 'more-btn', 'aria-label': 'More actions', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('i-more'));
  const wrap = h('span', { class: 'menu-wrap' }, button);
  const closeMenu = (refocus = true) => {
    wrap.querySelector('.menu')?.remove();
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  const item = (label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(false); fn(); } }, label);
  button.addEventListener('click', () => {
    if (wrap.querySelector('.menu')) return closeMenu();
    const note = current?.view?.note;
    const menu = h('div', { class: 'menu', role: 'menu', 'aria-label': 'More actions' },
      note ? h('p', { class: 'small muted', style: 'padding:4px 8px' }, note) : null,
      item('Copy citation', () => copyCitation(result)),
      item('Show policy basis', () => openBasisSheet(result, button)),
      item('Clear highlights', () => clearHighlights(true)),
      item('Choose file', chooseFile),
      item('Show text checked', () => { setInputVisible(true); $('input-wrap').open = true; $('text').focus(); }));
    wrap.append(menu);
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  });
  wrap.addEventListener('keydown', (e) => {
    const menu = wrap.querySelector('.menu');
    if (!menu) return;
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeMenu(false); });
  wrap.closeMenu = closeMenu;
  return wrap;
}

async function copyCitation(result) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const text = formatCitation(result.label, citationsFor(result.basis), date);
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta); ta.select();
    ok = document.execCommand('copy');
    ta.remove();
  }
  const msg = ok ? 'Citation copied.' : 'Copy failed.';
  announce(msg);
  const flash = $('copy-flash');
  if (flash) { flash.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { flash.textContent = ''; }, 2000); }
  return ok;
}

// ---------- level 3: bottom sheet with the verbatim clause ----------
let sheetOpener = null;
function closeSheet() {
  const sheet = document.querySelector('.sheet');
  if (!sheet) return false;
  sheet.remove();
  sheetOpener?.focus?.();
  sheetOpener = null;
  return true;
}

function openSheet(title, cites, opener, extra = []) {
  closeSheet();
  sheetOpener = opener;
  const clauses = [];
  const items = cites.flatMap(passages).map((p) => {
    // One block, so the 4-line clamp cuts cleanly. " … " is the stored separator between passages.
    const clause = h('blockquote', { class: 'quote clause' }, p.quote);
    clauses.push(clause);
    return h('div', { class: 'sheet-item' }, h('p', { class: 'sheet-ref' }, `RIMPA Global ${p.document} v${p.version}, s${p.section}`), clause);
  });
  const close = h('button', { class: 'btn btn-primary', type: 'button', onclick: closeSheet }, 'Close');
  const readMore = h('button', { class: 'btn', type: 'button', hidden: true, 'aria-expanded': 'false',
    onclick: () => {
      const full = !clauses[0].classList.contains('full');
      clauses.forEach((c) => c.classList.toggle('full', full));
      readMore.textContent = full ? 'Show less' : 'Read full clause';
      readMore.setAttribute('aria-expanded', String(full));
    } }, 'Read full clause');
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-labelledby': 'sheet-title' },
    h('h2', { id: 'sheet-title' }, title),
    items.length ? items : h('p', { class: 'guidance' }, GUIDANCE_LABEL),
    h('div', { class: 'sheet-actions' }, readMore, ...extra, close));
  document.body.append(sheet);
  requestAnimationFrame(() => { readMore.hidden = !clauses.some((c) => c.scrollHeight > c.clientHeight + 1); });
  close.focus();
}

const openBasisSheet = (result, opener) => openSheet('Policy basis for this action', citationsFor(result.basis), opener,
  [h('button', { class: 'btn', type: 'button', onclick: () => copyCitation(result) }, 'Copy citation')]);

// ---------- check rows (levels 1 and 2) ----------
const shortRetention = (r) => (/Complaints and Grievance Policy s12/.test(r) ? 'Case file; per disposal authority' : 'Per disposal authority');

function quotesBlock(c, key) {
  if (!c.evidence.length) return null;
  const quote = (q) => h('blockquote', { class: 'quote', 'data-check': key, 'data-quote': q }, q);
  const rest = c.evidence.slice(1);
  const restBox = h('div', { hidden: true, id: `more-${key}` }, rest.map(quote));
  const more = rest.length ? h('button', { class: 'more', type: 'button', 'aria-expanded': 'false', 'aria-controls': `more-${key}`,
    onclick: () => { const open = restBox.hidden; restBox.hidden = !open; more.setAttribute('aria-expanded', String(open)); more.textContent = open ? 'Show fewer' : `+${rest.length} more`; } }, `+${rest.length} more`) : null;
  return h('div', {}, h('p', { class: 'from-label' }, current?.view?.file ? 'Quoted from the file' : 'From the email'), quote(c.evidence[0]), restBox, more);
}

function policyLine(c) {
  if (c.guidance_only) return h('p', { class: 'guidance' }, GUIDANCE_LABEL);
  const cite = c.citations[0];
  if (!cite) return null;
  const p = passages(cite)[0];
  const link = h('button', { class: 'policy-link', type: 'button', onclick: () => openSheet('Policy clause', [cite], link) }, `${p.document} s${p.section}`);
  return link;
}

function buildBody(key, c) {
  const labels = key === 'governance'
    ? h('div', {}, h('dl', { class: 'labels' },
      h('div', {}, h('dt', {}, 'Classification'), h('dd', {}, c.classification)),
      h('div', { title: c.retention }, h('dt', {}, 'Retention'), h('dd', {}, shortRetention(c.retention))),
      h('div', {}, h('dt', {}, 'Use with AI'), h('dd', {}, c.ai_use_allowed ? 'Yes' : 'No'))),
      h('p', { class: 'guidance' }, `Classification and AI use: ${GUIDANCE_LABEL}.`))
    : null;
  return h('div', { class: 'row-body', id: `region-${key}`, role: 'region', 'aria-labelledby': `head-${key}` },
    h('p', {}, c.summary),
    quotesBlock(c, key),
    h('p', {}, h('strong', {}, 'Next step: '), c.next_step),
    policyLine(c),
    labels,
    c.confidence !== 'high' ? h('p', { class: 'small muted' }, `${c.confidence[0].toUpperCase()}${c.confidence.slice(1)} confidence`) : null);
}

function renderRow([key, name], report, i) {
  const c = report[key];
  const ui = STATUS_UI[c.status];
  const head = h('button', { class: 'row-head', type: 'button', id: `head-${key}`, 'aria-expanded': 'false', 'aria-controls': `region-${key}`, 'data-key': key,
    onclick: () => (current.openKey === key ? closeRow() : openRow(key)) },
    h('span', { class: 'row-name' }, name),
    h('span', { class: `badge tone-${ui.tone}` }, icon(ui.icon), c.status),
    icon('i-chevron', 'chev'),
    h('span', { class: 'row-headline' }, c.headline));
  return h('div', { class: 'row', style: `--i:${i}`, 'data-key': key }, h('h3', { style: 'font:inherit' }, head));
}

function rowEl(key) { return $('view').querySelector(`.row[data-key="${key}"]`); }

async function openRow(key) {
  if (!current?.report) return;
  if (current.openKey && current.openKey !== key) closeRow(false);
  const row = rowEl(key);
  if (!row) return;
  current.openKey = key;
  row.querySelector('.row-head').setAttribute('aria-expanded', 'true');
  row.append(buildBody(key, current.report[key]));
  if (!current.view.file) highlightFor(key, current.report[key]); // files have no page to highlight
}

function closeRow(clear = true) {
  const key = current?.openKey;
  if (!key) return false;
  const row = rowEl(key);
  row?.querySelector('.row-head')?.setAttribute('aria-expanded', 'false');
  row?.querySelector('.row-body')?.remove();
  current.openKey = null;
  if (clear) clearHighlights();
  return true;
}

// ---------- highlights on the page: only for the open check ----------
async function pageCall(func, args = []) {
  if (!ext || pageTabId == null) return null;
  try {
    const [res] = await ext.scripting.executeScript({ target: { tabId: pageTabId }, func, args });
    return res?.result ?? null;
  } catch { return null; } // tab closed, navigated, or not allowed: highlights are optional
}

async function highlightFor(key, c) {
  if (!c.evidence.length) return;
  const res = await pageCall((q) => globalThis.__trustlens?.highlightQuotes(q) ?? null, [{ [key]: c.evidence }]);
  if (!res) return;
  if (current?.openKey !== key) { clearHighlights(); return; } // closed while we waited
  for (const el of document.querySelectorAll(`.quote[data-check="${key}"]`)) {
    const item = res.items.find((i) => i.quote === el.dataset.quote);
    if (item && !item.id) el.append(h('span', { class: 'nf' }, 'not found on page'));
  }
  const first = res.items.find((i) => i.id);
  if (first) pageCall((id) => globalThis.__trustlens?.scrollToHighlight(id) ?? null, [first.id]);
}

async function clearHighlights(say = false) {
  await pageCall(() => globalThis.__trustlens?.clearHighlights() ?? null);
  if (say) announce('Highlights cleared.');
}

// ---------- report ----------
function renderReport(view) {
  const report = attachCitations(view.report);
  current.report = report;
  current.openKey = null;
  setInputVisible(false);
  const quiet = view.findings.length
    ? h('p', { class: 'privacy num', title: Object.entries(countByType(view.findings)).map(([t, n]) => `${n} ${PII_WORDS[t] || t}`).join(', ') },
      `${plural(view.findings.length, 'item', 'items')} masked`)
    : null;
  const rows = h('div', { class: 'rows', role: 'group', 'aria-label': 'Checks' }, CHECKS.map((c, i) => renderRow(c, report, i)));
  rows.addEventListener('keydown', (e) => {
    const heads = [...rows.querySelectorAll('.row-head')];
    const i = heads.indexOf(document.activeElement);
    if (i < 0) return;
    const go = { ArrowDown: (i + 1) % heads.length, ArrowUp: (i - 1 + heads.length) % heads.length, Home: 0, End: heads.length - 1 }[e.key];
    if (go != null) { e.preventDefault(); heads[go].focus(); }
  });
  const f = view.file;
  const notice = [f ? `${f.name} · ${formatSize(f.size)} · Read ${f.chars.toLocaleString()} characters` : null,
    view.truncated ? `Only the first ${view.limit.toLocaleString()} characters were checked.` : null].filter(Boolean).join(' · ');
  show(h('div', { class: 'report' }, notice ? h('p', { class: 'fileinfo small muted' }, notice) : null, renderStamp(view.result, report), rows, quiet));
  announce(`Report ready. Recommended action: ${view.result.label}.`);
  const severe = CHECKS.find(([k]) => report[k].status === 'Concern') ?? CHECKS.find(([k]) => report[k].status === 'Check');
  if (severe) openRow(severe[0]);
}

async function renderHistory() {
  setInputVisible(false);
  let history = await load('history', []);
  if (PREVIEW && history.length === 0) {
    const now = Date.now();
    history = [
      { id: 3, ts: now - 3600e3, label: 'Do not distribute until reviewed', basis: [{ id: 'C1', version: '3.0' }], decision: { kind: 'followed' } },
      { id: 2, ts: now - 26 * 3600e3, label: 'Verify the source first', basis: [{ id: 'EC1', version: '2.0' }], decision: { kind: 'overridden', reason: 'Source confirmed by phone' } },
      { id: 1, ts: now - 50 * 3600e3, label: 'OK to use', basis: [{ id: 'V1', version: '3.0' }], decision: null },
    ];
  }
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  show(h('section', { class: 'history' },
    h('h2', {}, 'History'),
    history.length
      ? h('ul', {}, history.map((e) => h('li', {},
        h('span', { class: 'when num' }, fmt.format(e.ts)),
        h('span', { class: 'what' }, e.label),
        e.file ? h('span', { class: 'when' }, `File: ${e.file.name} (${e.file.type})`) : null,
        e.basis?.length ? h('span', { class: 'when' }, `Basis: ${[...new Set(e.basis.map((b) => `${b.id} (v${b.version})`))].join(', ')}`) : null,
        h('span', {}, !e.decision ? 'No decision recorded' : e.decision.kind === 'followed' ? 'You followed the advice' : `You overrode the advice${e.decision.reason ? `: ${e.decision.reason}` : ''}`))))
      : h('p', { class: 'message' }, 'No checks yet. Only the action and your decision are kept, never the text.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: backFromHistory }, 'Back'),
      history.length ? h('button', { class: 'btn', type: 'button', onclick: async () => { await save('history', []); renderHistory(); } }, 'Clear history') : null),
  ));
  announce('History.');
}
function backFromHistory() {
  if (current?.view) { renderReport(current.view); } else renderEmpty();
}

// ---------- running a check ----------
const SAMPLE_FOR = { escalate: 'A', verify: 'B', clean: 'C', approve: 'C' };
async function loadSample() {
  const entry = (await loadDemoEntries()).find((e) => e.id === (SAMPLE_FOR[params.get('sample')] ?? 'A'));
  return { text: (await (await fetch(entry.file)).text()).trim(), entry };
}

async function recordHistory(result, file = null) {
  const history = await load('history', []);
  // Audit record: the policy ids behind the action and the version of each cited document. Never the text.
  const basis = citationsFor(result.basis).flatMap((c) => passages(c).map((p) => ({ id: c.id, document: p.document, version: p.version })));
  const entry = { id: Date.now(), ts: Date.now(), action: result.action, label: result.label, basis, decision: null };
  if (file) entry.file = file; // name, type and the SHA-256 of the masked text. Never the file or its text.
  await save('history', [entry, ...history].slice(0, 20));
  return entry.id;
}

async function finish(view) {
  current = { view, report: null, decision: null, entryId: await recordHistory(view.result, view.fileRecord), openKey: null };
  renderReport(view);
}

async function tryDemo() {
  if (ext) await ext.storage.local.set({ demoMode: true });
  await refreshDemoPill();
  runCheck();
}

const DEMO_DELAY_MS = 1500; // long enough for the loading state to be seen
const CACHE_LIMIT = 50;
const cacheGet = async (key) => (await load('liveCache', {}))[key]?.report ?? null;
async function cachePut(key, report) {
  const cache = await load('liveCache', {});
  cache[key] = { report, ts: Date.now() };
  const newest = Object.entries(cache).sort((x, y) => y[1].ts - x[1].ts).slice(0, CACHE_LIMIT);
  await save('liveCache', Object.fromEntries(newest));
}

async function runCheck() {
  const id = ++runId;
  const settings = await getSettings();
  await clearHighlights();
  renderLoading();
  try {
    let text = $('text').value.trim();
    let report;
    let curated = null; // saved demo reports carry a curated basis and step for the overall action
    let note = null;    // shown in the overflow menu when the report was not a fresh live check

    if (PREVIEW) {
      const sample = await loadSample();
      curated = sample.entry.overall ?? null;
      text = sample.text;
      $('text').value = text;
      updateInputMeta();
      await sleep(500);
      report = sample.entry.report;
      note = 'Demo mode: a saved sample report, not a check of your text.';
    }
    if (!text) { renderEmpty(); return; }
    // Mask the whole text first, then cut: a cut can never leave half an email address in the sent text.
    const limit = fileInfo ? FILE_CHAR_LIMIT : MAX_CHARS;
    const scan = scanPii(text);
    const { findings } = scan;
    const { text: maskedText, truncated } = truncateAtWord(scan.maskedText, limit); // only maskedText ever leaves this function

    if (!report && settings.demoMode) {
      const entry = findDemoEntry(text, await loadDemoEntries(), fileInfo ? 'file' : 'email');
      if (entry) {
        await sleep(DEMO_DELAY_MS);
        report = entry.report;
        curated = entry.overall ?? null;
        note = `Demo mode: a saved report for “${entry.subject}”.`;
      }
    }
    if (!report) {
      const key = await cacheKey(maskedText);
      report = await cacheGet(key);
      if (report) {
        note = 'Replayed from an earlier check of the same text.';
      } else {
        if (!settings.apiKey) {
          throw new Error(settings.demoMode
            ? 'Demo mode has no saved report for this text, and no API key is set for a live check.'
            : 'No API key is set.');
        }
        const [{ assess }, { policiesForPrompt }] = await Promise.all([import('./assess.js'), import('./policies.js')]);
        report = await assess(maskedText, policiesForPrompt(), settings);
        await cachePut(key, report);
      }
    }
    if (id !== runId) return;
    const result = overallAction(report, findings);
    if (curated) Object.assign(result, curated); // action and label always come from rules.js
    const file = fileInfo ? { ...fileInfo } : null;
    const fileRecord = file ? { name: file.name, type: file.kind, sha256: await sha256Hex(maskedText) } : null;
    await finish({ report, findings, result, note, file, fileRecord, truncated, limit });
  } catch (err) {
    if (id === runId) renderError(err.message || String(err));
  }
}

let demoEntries;
async function loadDemoEntries() {
  demoEntries ??= await (await fetch('demo-results.json')).json();
  return demoEntries;
}

// ---------- files ----------
const chooseFile = () => $('file-input').click();

async function handleFile(file) {
  if (!file) return;
  const id = ++runId;
  await clearHighlights();
  renderLoading();
  announce('Reading the file.');
  try {
    const r = await extractFile(file); // text is read here, in the browser. Nothing has been sent anywhere.
    if (id !== runId) return;
    $('text').value = r.text;
    updateInputMeta();
    fileInfo = { name: r.name, kind: r.kind, size: r.size, chars: r.chars };
    await runCheck();
  } catch (err) {
    if (id !== runId) return;
    fileInfo = null;
    renderError(err instanceof FileError ? err.message : 'This file could not be read.', { file: true });
  }
}

$('file-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); });
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('dragging'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  document.body.classList.remove('dragging');
  handleFile(e.dataTransfer.files[0]);
});

// ---------- wiring ----------
$('run').addEventListener('click', runCheck);
$('settings').addEventListener('click', () => (ext ? ext.runtime.openOptionsPage() : window.open('options.html')));
$('history-link').addEventListener('click', renderHistory);
$('text').addEventListener('input', () => { fileInfo = null; updateInputMeta(); });

// Escape closes, in order: the clause sheet, the menu, then the open check (which removes its highlights).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (closeSheet()) return;
  const menu = document.querySelector('.menu-wrap .menu');
  if (menu) { document.querySelector('.menu-wrap').closeMenu?.(); return; }
  if (current?.openKey) { const key = current.openKey; closeRow(); $('view').querySelector(`#head-${key}`)?.focus(); return; }
  clearHighlights();
});

function acceptPending(p) {
  if (!p) return;
  pageTabId = p.tabId ?? null;
  fileInfo = null;
  $('text').value = p.text || '';
  updateInputMeta();
  if (p.error) renderError(p.error);
  else renderEmpty();
}

if (ext) {
  ext.storage.session.get('pending').then((r) => acceptPending(r.pending));
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pending) acceptPending(changes.pending.newValue);
    if (area === 'local' && changes.demoMode) refreshDemoPill();
  });
}

refreshDemoPill();
switch (params.get('state')) {
  case 'report': runCheck(); break;
  case 'loading': renderLoading(); break;
  case 'error': renderError('The server did not answer in time.'); break;
  case 'history': renderHistory(); break;
  default: renderEmpty();
}
