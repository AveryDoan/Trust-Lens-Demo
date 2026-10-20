import { scanPii, countByType } from './pii.js';
import { overallAction } from './rules.js';
import { findDemoEntry, cacheKey, sha256Hex } from './demo.js';
import { extractFile, FileError, truncateAtWord, FILE_CHAR_LIMIT, formatSize, cleanText } from './extract.js';
import { attachCitations, citationsFor, formatCitation, GUIDANCE_LABEL } from './cite.js';
import { resolveEvidence, levelTwoItems, auditCounts, evidenceText, foundLine, NOT_FOUND, NOT_READ, CLUE, GUIDANCE_NOTE } from './evidence.js';
import { setPack, activePack } from './policies.js';
import { ROLE_LABELS, detectRole, findSavedCase, verifyCase, formatDay, money, signedMoney, checkSignals, hasAgreement, withoutAgreement, NO_AGREEMENT_NOTE, uniqueFiles, fileSummary, deriveFindings, becauseLabel } from './case.js';
import { isEmptyMeta, normaliseMeta, NOTE, CLEAN, provenanceSignals, provenanceSummary } from './provenance.js';

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
const PII_WORDS = { email: 'email address', phone: 'phone number', tfn: 'tax file number', card: 'card number', dob: 'date of birth', address: 'street address' };

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
    ? ext.storage.local.get({ endpoint: '', model: '', apiKey: '', demoMode: false, orgProfile: 'rimpa', gmailEnabled: false, gmailAddress: '' })
    : { endpoint: '', model: '', apiKey: '', demoMode: true, orgProfile: params.get('profile') === 'harbourview' ? 'harbourview' : 'rimpa' };
}

// ---------- state ----------
let runId = 0;
let current = null; // { view, decision, entryId, openKey }
let pageTabId = null;
let pageUrl = '';
const isGmailPage = () => /^https:\/\/mail\.google\.com\//.test(pageUrl);
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
    ext && isGmailPage() ? gmailBox() : null,
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
  } else if (current?.view?.case) {
    area.replaceChildren(); // the case view offers Follow advice and Override in the ... menu
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
function renderMenu(result, lead = []) {
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
      ...lead.map(([label, fn]) => item(label, fn)),
      item('Copy citation', () => copyCitation(result)),
      item('Show policy basis', () => openBasisSheet(result, button)),
      current?.view?.case ? item('What was read', () => renderReadingState(current.view, current.view.reading.sources.length, 3, true)) : item('Clear highlights', () => clearHighlights(true)),
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

async function copyText(text, flash) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta); ta.select();
    ok = document.execCommand('copy');
    ta.remove();
  }
  if (flash) { flash.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { flash.textContent = ''; }, 2000); }
  announce(ok ? 'Copied.' : 'Copy failed.');
  return ok;
}

async function copyCitation(result, flash = $('copy-flash')) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  return copyText(formatCitation(result.label, citationsFor(result.basis), date), flash);
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
    return h('div', { class: 'sheet-item' }, h('p', { class: 'sheet-ref' }, `${activePack().citePrefix}${p.document} v${p.version}, s${p.section}`), clause);
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
  if (current?.view?.case) renderCaseReport(current.view);
  else if (current?.view) renderReport(current.view);
  else renderEmpty();
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
  setPack(settings.orgProfile);
  refreshFooter();
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

function refreshFooter(_modeText = '', single = false) {
  // One footer line: the active policy pack. The case result uses the short name.
  $('foot-pack').textContent = single ? `Policy basis: ${activePack().short}` : activePack().footer;
}

// ---------- case bundles: several files (plus the open email) checked together ----------
let bundle = null; // { docs, settings, showOriginal }
const TOKEN_RE = /(\[(?:EMAIL|PHONE|TFN|CARD|DOB|ADDRESS)\])/;
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' }) : 'unknown');
const SAVED_CASES = ['demo/case-complaint/demo-result-complaint.json'];
let savedCases;
const loadSavedCases = async () => (savedCases ??= await Promise.all(SAVED_CASES.map(async (u) => (await fetch(u)).json())));
let fixtures;
async function loadFixtures() {
  try { fixtures ??= await (await fetch('demo/case-complaint/metadata-fixtures.json')).json(); } catch { fixtures = {}; }
  return fixtures;
}
function fixtureFor(name, role, fx) {
  if (fx[name]) return fx[name];
  const word = role === 'correspondence' ? 'correspondence' : role;
  const key = Object.keys(fx).find((k) => k.toLowerCase().includes(word));
  return key ? fx[key] : null;
}
const redactionCounts = (docs) => {
  const out = {};
  for (const d of docs) for (const f of d.findings ?? []) out[f.type] = (out[f.type] || 0) + 1;
  return out;
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

async function handleFiles(list) {
  const files = [...list];
  if (!files.length) return;
  const settings = await getSettings();
  setPack(settings.orgProfile);
  refreshFooter();
  const selection = !fileInfo && $('text').value.trim() ? $('text').value.trim() : '';
  if (files.length === 1 && !selection) return handleFile(files[0]); // one file on its own: the original flow
  const id = ++runId;
  await clearHighlights();
  renderLoading();
  announce('Reading the files.');
  try {
    const fx = settings.demoMode ? await loadFixtures() : {};
    const docs = [];
    for (const f of files) {
      let r;
      try { r = await extractFile(f); } catch (err) { throw new FileError(`${f.name}: ${err.message}`); } // text is read here; nothing is sent
      const { role } = detectRole(r.text);
      let meta = r.meta;
      let demoMeta = false;
      if (isEmptyMeta(meta) && settings.demoMode) {
        const m = fixtureFor(f.name, role, fx);
        if (m) { meta = normaliseMeta(m, { pages: r.pages }); demoMeta = true; }
      }
      docs.push({ name: f.name, kind: r.kind, size: r.size, text: r.text, pages: r.pages, pageTexts: r.pageTexts, meta, demoMeta, role, fromMail: false });
    }
    if (selection) {
      const guess = detectRole(selection).role;
      docs.push({ name: 'Open email', kind: 'email', size: selection.length, text: cleanText(selection), pages: null, meta: null, demoMeta: false, role: guess === 'other' ? 'correspondence' : guess, fromMail: true });
    }
    for (const d of docs) { const s = scanPii(d.text); d.masked = s.maskedText; d.findings = s.findings; } // masked locally, per document
    if (id !== runId) return;
    bundle = { docs, settings, showOriginal: false };
    renderReview();
  } catch (err) {
    if (id === runId) renderError(err instanceof FileError ? err.message : 'These files could not be read.', { file: true });
  }
}

function taggedText(text) {
  return text.split(TOKEN_RE).map((part, i) => (i % 2 ? h('span', { class: 'tag' }, part) : part));
}

const reviewSignals = (d) => (d.kind === 'email' || d.notRead ? [] : provenanceSignals({ meta: d.meta, role: d.role, text: d.text, fromMail: Boolean(d.fromMail) }).filter((s) => s.severity === 'check'));

// One row per file. Run AI is in a bar that stays at the bottom of the panel.
function renderReview() {
  setInputVisible(false);
  refreshFooter();
  const b = bundle;
  b.docs = uniqueFiles(b.docs);
  const demo = b.settings.demoMode;
  const counts = redactionCounts(b.docs);
  const total = sum(counts);
  const gate = !demo && activePack().forbidsExternalAi && total > 0;
  const files = fileSummary(b.docs);
  const perType = Object.entries(counts).map(([t, n]) => `${n} ${PII_WORDS[t] || t}`).join(', ');

  const rows = h('ul', { class: 'files' }, b.docs.map((d, i) => (d.notRead
    ? h('li', { class: 'file-row notread', title: d.reason, ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); e.stopPropagation(); fillSlot(i, e.dataTransfer.files[0]); } },
      h('span', { class: 'role-chip notread-chip' }, 'Not read'), h('span', { class: 'fname' }, d.name),
      h('button', { class: 'textlink', type: 'button', onclick: () => { slotIndex = i; $('slot-input').click(); } }, 'Drop file'))
    : h('li', { class: 'file-row' },
      h('span', { class: 'role-chip' }, ROLE_LABELS[d.role]), h('span', { class: 'fname' }, d.name),
      d.role === 'invoice' && reviewSignals(d).length ? h('span', { class: 'doc-chip flag' }, 'Provenance: check') : null, // one chip, on the invoice row
      h('span', { class: 'small muted status' }, 'Read')))));

  const box = h('div', { class: 'seebox', tabindex: '0', role: 'region', 'aria-label': 'Text the AI will see, read-only' },
    b.docs.filter((d) => !d.notRead).map((d) => h('div', { class: 'seedoc' }, h('h4', {}, d.name), h('p', {}, b.showOriginal ? d.text : taggedText(d.masked)))));
  const see = h('details', { class: 'see', ontoggle: (e) => { b.seeOpen = e.target.open; } },
    h('summary', {}, 'Show what the AI will see'),
    h('button', { class: 'textlink', type: 'button', onclick: () => { b.showOriginal = !b.showOriginal; renderReview(); } }, b.showOriginal ? 'Show redacted' : 'Show original'),
    box);
  if (b.seeOpen) see.open = true;

  show(h('section', { class: 'review' },
    h('h2', {}, 'Review before AI'),
    rows,
    h('p', { class: 'review-summary' }, files.text),
    h('p', { class: 'review-summary' }, total ? `${plural(total, 'item', 'items')} masked locally` : 'No personal details found to mask'),
    total ? h('p', { class: 'small muted' }, perType) : null,
    see,
    h('p', { class: gate ? 'gate' : 'small muted', role: gate ? 'alert' : null }, gate
      ? 'Personal information found. Names may remain in the text sent for analysis. This demo uses fictional data; production would use an approved internal model.'
      : 'Names are not masked locally. Demo data only.'),
    h('p', { class: 'small muted' }, demo ? 'Demo mode: no call is made.' : 'One AI call with the masked text shown above.'),
    h('div', { class: 'bar' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => runCase(gate) }, 'Run AI'),
      h('button', { class: 'textlink', type: 'button', onclick: () => { bundle = null; renderEmpty(); } }, 'Cancel')),
  ));
  announce('Review before AI. Nothing is sent until you choose Run AI.');
}

const STEPS = (n) => [`Reading ${n} documents`, 'Checking the amounts', 'Checking against the policy', 'Preparing next steps'];
function renderProgress(done, n) {
  show(h('section', { class: 'progress', 'aria-busy': 'true' },
    h('h2', {}, 'Running AI'),
    h('ol', {}, STEPS(n).map((label, i) => h('li', { class: i < done ? 'done' : i === done ? 'now' : 'wait' }, i < done ? '✓ ' : i === done ? '… ' : '', label)))));
  announce(STEPS(n)[Math.min(done, 3)]);
}

const emailDate = (docs) => {
  const m = /(?:Date|Sent):\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(docs.map((d) => d.text).join(' '));
  const mi = m ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase().slice(0, 3)) : -1;
  return m && mi >= 0 ? `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
};

async function runCase(gateShown) {
  const b = bundle;
  const id = ++runId;
  const readDocs = b.docs.filter((d) => !d.notRead); // a file that could not be read takes no part
  const n = readDocs.length;
  try {
    let result = null;
    let mode = 'live';
    if (b.settings.demoMode) {
      const saved = findSavedCase(readDocs.map((d) => d.text).join(' '), await loadSavedCases());
      if (saved) {
        const problems = verifyCase(saved); // sums, GST and due dates are recomputed here; a mismatch stops the demo
        if (problems.length) throw new Error(`The saved result failed its own checks: ${problems[0]}`);
        renderProgress(0, n);
        result = saved;
        mode = 'demo';
      }
    }
    if (!result) {
      if (!b.settings.apiKey) throw new Error(b.settings.demoMode ? 'Demo mode has no saved result for these files, and no API key is set for a live check.' : 'No API key is set.');
      renderProgress(1, n);
      const { assessCase } = await import('./case-live.js');
      const docTexts = Object.fromEntries(readDocs.map((d) => [d.role, d.text]));
      result = await assessCase(readDocs.map((d) => ({ name: d.name, role: d.role, maskedText: d.masked })), b.settings, { emailISO: b.emailISO ?? emailDate(readDocs), docTexts });
    }
    if (id !== runId) return;
    const noAgreement = !hasAgreement(readDocs);
    if (noAgreement) result = withoutAgreement(result); // no agreed-side quote may come from the saved text
    setPack(result.pack);
    // Provenance comes from file metadata only. The email body has none, so it never raises a signal.
    const prov = readDocs.map((d) => {
      const signals = d.kind === 'email' ? [] : provenanceSignals({ meta: d.meta, role: d.role, text: d.text, fromMail: Boolean(d.fromMail) });
      return { name: d.name, role: d.role, signals, summary: d.kind === 'email' ? 'No file details' : provenanceSummary(signals), demo: Boolean(d.demoMeta) };
    });
    const view = { case: true, result, docs: readDocs, prov, noAgreement, mode, gate: { shown: gateShown, decision: gateShown ? 'continue' : 'not shown' }, counts: redactionCounts(readDocs), note: `${mode === 'demo' ? 'Demo mode: a saved result. ' : ''}${plural(sum(redactionCounts(readDocs)), 'item', 'items')} masked locally.` };
    view.findings = await findingsFor(result);
    view.evidence = await evidenceFor(result, readDocs); // prepared quotes, each checked against the files that were read
    view.reading = { sources: readingSources(readDocs, result, b.emailInfo), concerns: result.checks.filter((c) => c.status !== 'ok').length };
    current = { view, report: null, decision: null, entryId: await recordCaseHistory(view), openKey: null };
    await playReading(view, mode === 'demo'); // what was read, then the recommendations
  } catch (err) {
    if (id === runId) renderError(err.message || String(err), { file: true });
  }
}

async function findingsFor(result) {
  try {
    const map = await (await fetch('demo/case-complaint/demo-findings-map.json')).json();
    if (map.caseId === result.id) return map; // prepared wording, used exactly
  } catch { /* no prepared map: derive one from the result */ }
  return deriveFindings(result);
}

// demo-evidence.json belongs to the saved complaint case. Every quote is checked here, against the redacted text of the
// files that were read; a quote that is not found is never shown as evidence.
async function evidenceFor(result, docs) {
  try {
    const raw = await (await fetch('demo/case-complaint/demo-evidence.json')).json();
    if (raw.caseId !== result.id) return null;
    return { raw, resolved: resolveEvidence(raw, docs) };
  } catch { return null; }
}

async function recordCaseHistory(view) {
  const history = await load('history', []);
  const r = view.result;
  const ids = [...new Set([...r.stamp.basis, ...r.case.nextSteps.flatMap((s) => s.basis), ...r.case.outcomeDue.basis])];
  const basis = citationsFor(ids).flatMap((c) => passages(c).map((p) => ({ id: c.id, document: p.document, version: p.version })));
  // Audit record: roles, steps, basis ids, redaction counts, gate decision, Run AI, mode. Never any text.
  const entry = { id: Date.now(), ts: Date.now(), action: r.overall, label: r.stamp.title, basis, decision: null,
    case: { roles: view.docs.map((d) => d.role), steps: r.case.nextSteps.map((s) => ({ rank: s.rank, basis: s.basis })), redaction: view.counts, gate: view.gate, runAi: true, mode: view.mode, pack: r.pack, evidence: view.evidence ? auditCounts(view.evidence.resolved) : null } }; // evidence: step ids and counts only, never quote text
  await save('history', [entry, ...history].slice(0, 20));
  return entry.id;
}

// ---------- Gmail: "Use this email" (only for the demo account named in settings) ----------
const GMAIL_OFF = 'Gmail reading is off for this account. Use a demo account.';
let slotIndex = -1;

function gmailBox() {
  return h('div', { class: 'gmail-box' },
    h('p', {}, 'A Gmail message is open?'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: useThisEmail }, 'Use this email'),
    h('p', { class: 'small muted', id: 'gmail-status', role: 'status' }, 'Nothing is read until you press the button.'));
}
const gmailStatus = (msg) => { const el = $('gmail-status'); if (el) el.textContent = msg; announce(msg); };

const inTab = async (func, args = []) => (await ext.scripting.executeScript({ target: { tabId: pageTabId }, func, args }))[0]?.result;

async function fetchAttachment(url) {
  const res = await ext.runtime.sendMessage({ type: 'tl-fetch', url }); // the service worker downloads it with the browser's own session
  if (!res?.ok) throw new Error(res?.error || `HTTP ${res?.status ?? 'unknown'}`);
  return { bytes: Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0)), type: res.type };
}

// Selected text, then the drop zone, when the Gmail reader cannot be used. Always says which path was taken.
async function gmailFallback(reason) {
  let selected = '';
  try { selected = (await inTab(() => getSelection().toString())) ?? ''; } catch { /* page not reachable */ }
  if (selected.trim()) {
    $('text').value = selected.trim(); updateInputMeta(); fileInfo = null;
    renderEmpty();
    $('view').append(h('p', { class: 'small muted', style: 'padding-inline:16px' }, `${reason} Using the text you selected on the page.`));
    announce(`${reason} Using the text you selected.`);
  } else {
    gmailStatus(`${reason} Select the text on the page, or drop the downloaded attachments below.`);
  }
}

async function useThisEmail() {
  const settings = await getSettings();
  if (!settings.gmailEnabled || !settings.gmailAddress) return gmailStatus(GMAIL_OFF); // reads nothing
  setPack(settings.orgProfile);
  gmailStatus('Reading the open message…');
  let r;
  try {
    await ext.scripting.executeScript({ target: { tabId: pageTabId }, files: ['gmail-reader.js'] });
    r = await inTab((expected) => globalThis.__tlGmail.read({ expected }), [settings.gmailAddress]);
  } catch (err) { return gmailFallback('Gmail could not be reached.'); }
  if (!r || r.reason === 'account-mismatch' || r.reason === 'no-expected-address') return gmailStatus(GMAIL_OFF);
  if (!r.ok) return gmailFallback('No open message was found.');
  console.debug('[TrustLens Gmail]', r.debug.join(' | '));

  const docs = [];
  const emailText = cleanText(`${r.subject}\n${r.body}`);
  docs.push({ name: 'Open email', kind: 'email', size: emailText.length, text: emailText, pages: null, meta: null, demoMeta: false, role: 'email', fromMail: true });
  for (const c of r.chips) {
    const notRead = (reason) => docs.push({ name: c.name, kind: 'pdf', size: 0, text: '', masked: '', findings: [], role: 'other', notRead: true, reason });
    if (!c.url) { notRead('No download link was found'); continue; }
    try {
      gmailStatus(`Reading ${c.name}…`);
      const { bytes, type } = await fetchAttachment(c.url);
      const out = await extractFile(new File([bytes], c.name, { type }));
      docs.push({ name: c.name, kind: out.kind, size: out.size, text: out.text, pages: out.pages, pageTexts: out.pageTexts, meta: out.meta, demoMeta: false, role: detectRole(out.text).role, fromMail: true });
    } catch (err) { notRead(err instanceof FileError ? err.message : `The download failed (${err.message})`); }
  }
  const rows = uniqueFiles(docs); // one row per file; a file that was read is never also "Not read"
  for (const d of rows) if (!d.notRead) { const s = scanPii(d.text); d.masked = s.maskedText; d.findings = s.findings; }
  bundle = { docs: rows, settings, showOriginal: false, emailISO: r.date.iso, emailInfo: { subject: r.subject, sender: r.sender.name || r.sender.address, date: r.date.iso } };
  renderReview();
}

// A file that could not be read: the person drops the downloaded file onto its row (or chooses it).
async function fillSlot(i, file) {
  if (!file || !bundle?.docs[i]?.notRead) return;
  try {
    const out = await extractFile(file);
    const d = { name: file.name, kind: out.kind, size: out.size, text: out.text, pages: out.pages, pageTexts: out.pageTexts, meta: out.meta, demoMeta: false, role: detectRole(out.text).role, fromMail: false };
    const s = scanPii(d.text); d.masked = s.maskedText; d.findings = s.findings;
    bundle.docs[i] = d;
    bundle.docs = uniqueFiles(bundle.docs);
    renderReview();
  } catch (err) {
    bundle.docs[i].reason = err instanceof FileError ? err.message : 'That file could not be read';
    renderReview();
  }
}
$('slot-input').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; fillSlot(slotIndex, f); });

// ---------- "What was read": the email, each file and what was found in it, then the recommendation ----------
function readingSources(docs, result, emailInfo) {
  const byRole = Object.fromEntries(result.case.documents.map((d) => [d.role, d]));
  return docs.map((d) => {
    if (d.kind === 'email') {
      const facts = emailInfo ? [`Subject: ${emailInfo.subject}`, `From ${emailInfo.sender || 'unknown sender'}, sent ${formatDay(emailInfo.date)}`] : ['Text of the open email'];
      return { label: ROLE_LABELS.email, name: d.name, facts, pii: [], pages: null };
    }
    if (d.role === 'policy') return { label: ROLE_LABELS.policy, name: d.name, facts: ['The organisation’s own procedure. Used for the clause quotes.'], pii: [], pages: d.pages };
    const saved = byRole[d.role];
    return { label: ROLE_LABELS[d.role], name: d.name, facts: saved?.keyFacts ?? [], pii: saved?.pii ?? [], pages: d.pages };
  });
}

function renderReadingState(view, upTo, steps, done) {
  const { sources, concerns } = view.reading;
  const r = view.result;
  const stepLabels = ['Checking the amounts', 'Checking against the policy', 'Preparing next steps'];
  refreshFooter();
  show(h('section', { class: 'reading' },
    h('h2', {}, done ? 'What was read' : 'Reading the case'),
    h('ul', { class: 'read-list' }, sources.map((s, i) => {
      const state = i < upTo ? 'done' : i === upTo ? 'now' : 'wait';
      return h('li', { class: state },
        h('p', { class: 'read-head' }, h('span', { class: 'mark' }, state === 'done' ? '✓' : state === 'now' ? '…' : ''), h('span', { class: 'role-chip' }, s.label), h('b', { class: 'fname' }, s.name), s.pages ? h('span', { class: 'small muted' }, `${s.pages} ${s.pages === 1 ? 'page' : 'pages'}`) : null),
        state === 'done' ? h('ul', { class: 'facts-list' }, s.facts.map((f) => h('li', {}, f)), s.pii.length ? h('li', { class: 'pii-line' }, `Personal details found and masked: ${s.pii.join(', ')}`) : null) : null);
    })),
    h('ol', { class: 'read-steps' }, stepLabels.map((l, i) => h('li', { class: i < steps ? 'done' : 'wait' }, h('span', { class: 'mark' }, i < steps ? '✓' : ''), l))),
    done ? h('div', { class: 'read-done' },
      h('p', { class: 'small muted' }, `Read ${plural(sources.length, 'source', 'sources')}. ${concerns ? `${plural(concerns, 'area needs', 'areas need')} attention.` : 'No areas need attention.'}`),
      h('p', { class: 'recommend' }, h('span', { class: 'small muted' }, 'Recommended: '), r.stamp.title),
      h('p', { class: 'small' }, `${r.stamp.owner}, due ${formatDay(r.stamp.due)}`),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderCaseReport(view) }, 'Show recommendations')) : null));
}

async function playReading(view, animate) {
  const n = view.reading.sources.length;
  if (animate) {
    for (let i = 0; i < n; i++) { renderReadingState(view, i, 0, false); announce(`Reading ${view.reading.sources[i].name}`); await sleep(450); }
    for (let k = 1; k <= 3; k++) { renderReadingState(view, n, k, false); await sleep(400); }
  }
  renderReadingState(view, n, 3, true);
  announce('Finished reading. Recommendations are ready.');
}

// ----- case result. Level 1: the finding and the step it causes. Level 2: evidence opens in place, one at a time. -----
function policyChip(id) {
  const cite = citationsFor([id])[0];
  if (!cite) return null;
  const p = passages(cite)[0];
  const copy = h('button', { class: 'btn', type: 'button', onclick: () => copyCitation({ label: current?.view?.result?.stamp?.title ?? 'Recommended action', basis: [id] }) }, 'Copy citation');
  const chip = h('button', { class: 'policy-link', type: 'button', onclick: () => openSheet('Policy clause', [cite], chip, [copy]) }, `${id} · ${p.section.replace(/^\d+\.\s*[^,]*,\s*/, 's')}`);
  return chip;
}
const chipRow = (ids) => h('span', { class: 'chips-inline' }, ids.map(policyChip).filter(Boolean));

function fileDetails(d, p, short = false) {
  const m = d.meta;
  const rows = isEmptyMeta(m)
    ? [['File details', 'None found in the file']]
    : [['Created with', m.creator || m.producer || 'unknown'], ['Created', fmtDate(m.created)], ['Modified', fmtDate(m.modified)], ['Author', m.author || 'none']];
  const signals = p.signals;
  return h('div', { class: 'filedetails' },
    h('p', { class: 'fd-title' }, `${d.name}`, d.demoMeta ? h('b', { class: 'demo-meta' }, ' Demo metadata') : null),
    h('dl', { class: 'facts' }, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    signals.length
      ? h('ul', { class: 'signals' }, signals.map((s) => h('li', {}, h('b', {}, `${s.id} ${s.label}`), `: ${s.reason}`)))
      : h('p', { class: 'small' }, CLEAN),
    h('p', { class: 'small muted' }, short ? CLUE : NOTE));
}

// ----- evidence: quotes from the files, each verified against the file that was read -----
// Path steps whose evidence is kept under another step id in demo-evidence.json
const EV_ALIAS = { neutral: 'bias', confirm: 'claims' };
const evId = (step) => EV_ALIAS[step.id] ?? step.id;
const evItems = (view, id) => view.evidence?.resolved.steps[id] ?? null;

function quoteBlock(view, item) {
  const head = h('p', { class: 'ev-head' }, h('span', { class: 'role-chip' }, item.label), h('span', { class: 'small muted' }, item.shows));
  if (item.kind === 'metadata') {
    const i = view.docs.findIndex((d) => matchesDoc(item.doc, d));
    return item.status === 'verified' && i >= 0 ? h('div', { class: 'ev-item ev-meta' }, head, fileDetails(view.docs[i], view.prov[i], true)) : h('div', { class: 'ev-item' }, head, h('p', { class: 'small muted' }, NOT_READ));
  }
  if (item.status === 'verified') {
    return h('div', { class: 'ev-item', 'data-status': 'verified' }, head, h('blockquote', { class: 'quote' }, item.text), h('p', { class: 'ev-found small' }, h('span', { 'aria-hidden': 'true' }, '✓ '), foundLine(item)));
  }
  return h('div', { class: 'ev-item', 'data-status': item.status }, head, h('p', { class: 'small muted' }, item.status === 'notread' ? NOT_READ : NOT_FOUND)); // never the quote
}
const matchesDoc = (doc, d) => ({ invoice: d.role === 'invoice', agreement: d.role === 'agreement', emails: d.role === 'correspondence' && d.kind !== 'email', email: d.kind === 'email' }[doc] ?? false);

// The details of the invoice file are shown only when signals fired on it.
const visibleItems = (view, items) => items.filter((i) => i.kind !== 'metadata' || view.prov.some((p) => p.role === i.doc && checkSignals(p).length));

// Agreed vs billed, side by side: the contradiction at a glance. Quotes come from the evidence list, not from the model.
function sideBySide(view, items, withAmounts) {
  const agreed = items.find((i) => i.doc === 'agreement'), billed = items.find((i) => i.doc === 'invoice');
  if (!agreed || !billed) return [];
  const col = (title, item) => h('div', { class: 'sbs-col' }, h('span', { class: 'role-chip' }, title),
    item.status === 'verified' ? h('blockquote', { class: 'quote' }, item.text) : h('p', { class: 'small muted' }, item.status === 'notread' ? NOT_READ : NOT_FOUND),
    item.status === 'verified' ? h('p', { class: 'ev-found small' }, h('span', { 'aria-hidden': 'true' }, '✓ '), foundLine(item)) : null);
  const tot = view.result.case.reconciliation.find((x) => x.item === 'Total (incl GST)');
  return [
    h('p', { class: 'ev-label' }, 'Agreed vs billed'),
    h('div', { class: 'sbs' }, col('Agreement', agreed), col('Invoice', billed)),
    withAmounts && tot ? h('p', { class: 'sbs-amounts' }, `Agreed ${money(tot.agreed)} · Billed ${money(tot.billed)} · Difference ${signedMoney(tot.difference)}`) : null,
  ];
}

// The rule for a step: the verbatim clause for its first known basis id (attached by code from the policy file).
// Unknown ids are dropped. A step with no clause shows the guidance note and no rule block.
function ruleBlock(view, basis, label) {
  const cites = citationsFor(basis);
  if (!cites.length) return h('p', { class: 'guidance-note small', 'data-guidance': 'true' }, GUIDANCE_NOTE);
  const ids = cites.map((c) => c.id);
  const p = passages(cites[0])[0];
  const flash = h('span', { class: 'copy-status', role: 'status' });
  return h('div', { class: 'ev-rule' },
    h('p', { class: 'ev-label' }, 'Rule'),
    h('blockquote', { class: 'quote' }, p.quote),
    h('p', { class: 'small muted' }, `${ids[0]} · ${p.document} v${p.version}, s${p.section}`),
    h('div', { class: 'ev-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => copyCitation({ label, basis: ids.slice(0, 1) }, flash) }, 'Copy citation'), flash),
    ids.length > 1 ? chipRow(ids.slice(1)) : null);
}

// Plain text for "Copy evidence": the action, the verified quotes with their file labels, and the rule. Redacted.
function copyEvidenceButton(view, step, items) {
  const flash = h('span', { class: 'copy-status', role: 'status' });
  const cite = citationsFor(step.basis)[0];
  const btn = h('button', { class: 'btn', type: 'button', onclick: () => copyText(evidenceText({
    action: step.action, owner: step.owner, due: formatDay(step.due), because: step.because ? `${step.because.check}: ${step.because.text}` : '', items,
    rule: cite ? `${cite.id}: "${passages(cite)[0].quote}" (${passages(cite)[0].document} v${passages(cite)[0].version}, s${passages(cite)[0].section})` : GUIDANCE_NOTE,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) }), flash) }, 'Copy evidence');
  return h('span', { class: 'ev-actions' }, btn, flash);
}

// Evidence for one step. `full` (Level 2) lists everything; otherwise the first block is shown and the rest opens in place.
function stepEvidence(view, id, { full = false, amounts = false } = {}) {
  const all = evItems(view, id);
  if (!all) return [];
  const items = visibleItems(view, all);
  const inline = [], more = [];
  if (id === 'approve') {
    const a = items.find((i) => i.doc === 'agreement'), b = items.find((i) => i.doc === 'invoice');
    const sbs = sideBySide(view, items, amounts);
    inline.push(...sbs);
    (full ? inline : more).push(...(sbs.length ? items.filter((i) => i !== a && i !== b) : items).map((i) => quoteBlock(view, i)));
  } else {
    items.forEach((i, n) => (n === 0 || full ? inline : more).push(quoteBlock(view, i)));
  }
  const box = h('div', { class: 'ev-more', hidden: true }, more);
  const link = more.length ? h('button', { class: 'textlink', type: 'button', 'aria-expanded': 'false', onclick: () => { box.hidden = !box.hidden; link.setAttribute('aria-expanded', String(!box.hidden)); link.textContent = box.hidden ? `Show all evidence (${items.length})` : 'Show less evidence'; } }, `Show all evidence (${items.length})`) : null;
  return [h('div', { class: 'ev-list', 'data-step': id }, h('p', { class: 'ev-label' }, 'Evidence'), ...inline, box, link)];
}

// "needs checking: the thread shows ..." -> a label (text, not colour alone) and its reason
const CLAIM_LABELS = { supported: 'Supported', 'needs checking': 'Needs checking', misinformation: 'Misinformation' };
function claimParts(status) {
  const m = /^(supported|needs checking|misinformation)\b[:\s]*(.*)$/i.exec(status);
  if (!m) return { label: 'Not shown in the documents', reason: '' };
  const reason = m[2].trim();
  return { label: CLAIM_LABELS[m[1].toLowerCase()], reason: reason ? reason[0].toUpperCase() + reason.slice(1) : '' };
}

// The customer's sentence next to the document's sentence (the 'claims' evidence comes in pairs: customer, then the file).
function pairBlock(view, left, right) {
  const col = (item) => h('div', { class: 'sbs-col' }, h('span', { class: 'role-chip' }, item.label), h('span', { class: 'small muted' }, item.shows),
    item.status === 'verified' ? h('blockquote', { class: 'quote' }, item.text) : h('p', { class: 'small muted' }, item.status === 'notread' ? NOT_READ : NOT_FOUND),
    item.status === 'verified' ? h('p', { class: 'ev-found small' }, h('span', { 'aria-hidden': 'true' }, '✓ '), foundLine(item)) : null);
  return h('div', { class: 'sbs' }, col(left), col(right));
}
// needs checking -> the first pair, misinformation -> the second
const claimPairs = (view) => { const c = evItems(view, 'claims'); return c && c.length >= 4 ? { 'needs checking': [c[0], c[1]], misinformation: [c[2], c[3]] } : {}; };

function accuracyEvidence(view) {
  const r = view.result;
  const fm = view.findings;
  const all = r.case.reconciliation;
  let expanded = false;
  const tbody = h('tbody');
  const fill = () => {
    tbody.replaceChildren(...all.filter((x) => expanded || fm.accuracyDefaultRows.includes(x.item)).flatMap((x) => [
      h('tr', {}, h('td', {}, x.item), h('td', { class: 'num-col' }, money(x.agreed)), h('td', { class: 'num-col' }, money(x.billed)), h('td', { class: 'num-col diff' }, signedMoney(x.difference))),
      h('tr', { class: 'qrow' }, h('td', { colspan: '4' }, x.agreedNote ? x.agreedNote : x.quoteAgreed ? `“${x.quoteAgreed}”` : '')),
    ]));
  };
  fill();
  const moreBtn = h('button', { class: 'textlink', type: 'button', onclick: () => { expanded = true; fill(); moreBtn.remove(); } }, fm.accuracyMoreLabel);
  const claims = h('ul', { class: 'claims', hidden: true }, r.case.claims.map((c) => {
    const { label, reason } = claimParts(c.status);
    const pair = claimPairs(view)[label.toLowerCase()];
    return h('li', { 'data-claim-status': label }, h('span', {}, c.claim), h('b', { class: 'cl-status' }, label), reason ? h('span', { class: 'small' }, reason) : null, pair ? pairBlock(view, pair[0], pair[1]) : null);
  }));
  const claimsBtn = h('button', { class: 'textlink', type: 'button', 'aria-expanded': 'false', onclick: () => { claims.hidden = !claims.hidden; claimsBtn.setAttribute('aria-expanded', String(!claims.hidden)); claimsBtn.textContent = claims.hidden ? 'See claims' : 'Hide claims'; } }, 'See claims');
  return [
    view.noAgreement ? h('p', { class: 'small' }, NO_AGREEMENT_NOTE) : null,
    h('table', { class: 'recon' }, h('thead', {}, h('tr', {}, ['Item', 'Agreed', 'Billed', 'Difference'].map((t, i) => h('th', { class: i ? 'num-col' : '' }, t)))), tbody),
    moreBtn,
    h('p', { class: 'small' }, fm.claimsSummary, ' ', claimsBtn),
    claims,
    ...stepEvidence(view, 'approve', { full: true }), // the quotes behind the table, then the rule
    ...(evItems(view, 'approve') ? [ruleBlock(view, fm.stamp.basis, fm.stamp.action)] : []),
  ];
}

const stepById = (view, id) => view.findings.alsoNeeded.find((s) => s.id === id);
const privacyStep = (view) => stepById(view, 'privacy');

function governanceEvidence(view) {
  const g = view.result.checks.find((c) => c.key === 'governance');
  return [
    g.found?.length ? h('div', {}, h('p', { class: 'ev-label' }, 'Found'), h('ul', { class: 'chips' }, g.found.map((f) => h('li', { class: 'chip-plain' }, f)))) : null,
    ...stepEvidence(view, 'privacy', { full: true }),
    ...(evItems(view, 'privacy') ? [ruleBlock(view, privacyStep(view).basis, privacyStep(view).action)] : []),
    h('div', {}, h('p', { class: 'ev-label' }, 'Clauses'), chipRow(g.basis ?? [])),
    g.manage?.length ? h('div', {}, h('p', { class: 'ev-label' }, 'How to manage'), g.manage.map((m) => h('p', { class: 'manage' }, h('b', {}, `${m.label}: `), m.text, ' ', chipRow(m.basis)))) : null,
  ];
}

function misleadingEvidence(view) {
  const items = view.evidence ? levelTwoItems('misleading', view.evidence.resolved, view.evidence.raw) : null;
  if (items) {
    const step = stepById(view, 'refer');
    return [h('div', { class: 'ev-list', 'data-step': 'refer' }, h('p', { class: 'ev-label' }, 'Evidence'), ...items.map((i) => quoteBlock(view, i))), ruleBlock(view, step.basis, step.action)];
  }
  const c = view.result.checks.find((x) => x.key === 'misleading');
  return (c.quotes ?? []).map((q) => h('div', {}, h('p', { class: 'ev-label' }, ROLE_LABELS[q.doc] ?? q.doc), q.note ? h('p', { class: 'small muted' }, q.note) : h('blockquote', { class: 'quote' }, q.text)));
}

function fileEvidence(view, i, withHedge = false) {
  const d = view.docs[i];
  const p = view.prov[i];
  return [fileDetails(d, p), withHedge ? h('p', { class: 'small muted' }, 'A clue, not proof. Signals, not proof. A person makes the final call.') : null];
}

// Bias: the quotes, then the note where a rule would normally appear. No clause in this pack covers bias, and none is invented.
function biasEvidence(view) {
  const c = view.result.checks.find((x) => x.key === 'bias');
  const list = stepEvidence(view, 'bias', { full: true });
  return [
    ...(list.length ? list : (c.quotes ?? []).map((q) => h('blockquote', { class: 'quote' }, q.text))),
    h('div', { class: 'ev-rule' }, h('p', { class: 'ev-label' }, 'Rule'), h('p', { class: 'small', 'data-guidance': 'true' }, c.basisNote ?? GUIDANCE_NOTE)),
  ];
}

const EVIDENCE = { accuracy: accuracyEvidence, governance: governanceEvidence, misleading: misleadingEvidence, bias: biasEvidence };

// Only one evidence panel is open at a time. It opens inside the element that asked for it.
function toggleEvidence(key, host, button, build) {
  const open = current.evidence;
  if (open) { open.el.remove(); open.button?.setAttribute('aria-expanded', 'false'); current.evidence = null; if (open.key === key) return; }
  const el = h('div', { class: 'evidence', role: 'region', 'data-evidence': key }, build());
  host.append(el);
  button?.setAttribute('aria-expanded', 'true');
  current.evidence = { key, el, button };
}

function becauseButton(key, host, build, ...kids) {
  const btn = h('button', { class: 'because', type: 'button', 'aria-expanded': 'false', onclick: () => toggleEvidence(key, host, btn, build) }, ...kids);
  return btn;
}

// "Also noted: Bias": a muted line. Where the prepared findings name a noted check, tapping it opens that evidence in the same accordion.
function notedLine(view) {
  const fm = view.findings;
  const host = h('div', { class: 'collapsed-checks ev-host' });
  const n = fm.noted?.[0];
  if (n && EVIDENCE[n.evidence]) host.append(becauseButton(`noted:${n.id}`, host, () => EVIDENCE[n.evidence](view), fm.collapsedChecks));
  else host.append(fm.collapsedChecks);
  return host;
}

function renderCaseReport(view) {
  setInputVisible(false);
  const r = view.result;
  const fm = view.findings;
  const invoiceIdx = view.prov.findIndex((p) => p.role === 'invoice');
  const flaggedIdx = view.prov.findIndex((p) => checkSignals(p).length);
  const stamp = fm.stamp;
  const decision = { label: stamp.action, basis: stamp.basis, action: r.overall };
  current.evidence = null;

  // document chips; a chip opens that file's details
  const chipHost = h('div', { class: 'doc-chips ev-host' });
  const chipEl = (label, i, flag) => { const c = h('button', { class: `doc-chip${flag ? ' flag' : ''}`, type: 'button', 'aria-expanded': 'false', onclick: () => toggleEvidence(`chip:${i}`, chipHost, c, () => fileEvidence(view, i, flag)) }, label); return c; };
  chipHost.append(...view.docs.map((d, i) => chipEl(ROLE_LABELS[d.role], i, false)), ...(flaggedIdx >= 0 ? [chipEl('Provenance: check', flaggedIdx, true)] : []));

  // the stamp: the finding, then the step
  const area = h('span', { id: 'decision', style: 'display:contents' });
  const card = h('section', { class: 'stamp-card ev-host', 'aria-labelledby': 'stamp-action' });
  const because = h('button', { class: 'because stamp-because', type: 'button', 'aria-expanded': 'false', onclick: () => toggleEvidence('stamp', card, because, () => EVIDENCE[stamp.evidence](view)) },
    h('span', { class: 'because-label' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), becauseLabel(stamp.because)),
    h('span', { class: 'because-text' }, stamp.because.text));
  const menu = renderMenu(decision, [['Follow advice', () => setDecision({ kind: 'followed' })], ['Override', () => renderDecision($('decision'), true)]]);
  card.append(because,
    h('h2', { class: 'stamp-action', id: 'stamp-action' }, stamp.action),
    h('p', { class: 'stamp-owner' }, `${stamp.owner} · due ${formatDay(stamp.due)}`),
    h('div', { class: 'stamp-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => renderPath(view) }, 'See the path'), area, h('span', { id: 'copy-flash', class: 'copy-status', role: 'status' }), menu));
  renderDecision(area);

  // also needed: each step with the finding that causes it
  const also = h('section', { class: 'also' }, h('h3', {}, 'Also needed'),
    h('ul', {}, fm.alsoNeeded.map((s) => {
      const li = h('li', { class: 'also-row ev-host' });
      const line = `Because ${s.because.check}: ${s.because.text}`;
      li.append(
        h('div', { class: 'also-main' },
          h('p', { class: 'also-action' }, s.action),
          s.evidence ? becauseButton(`row:${s.id}`, li, () => EVIDENCE[s.evidence](view), line) : h('p', { class: 'because plain' }, line),
          h('p', { class: 'also-owner' }, s.owner)),
        h('p', { class: 'also-due' }, formatDay(s.due)));
      return li;
    })));

  show(h('div', { class: 'report case' }, chipHost, view.noAgreement ? h('p', { class: 'agreement-note small' }, NO_AGREEMENT_NOTE) : null, card, also, notedLine(view)));
  refreshFooter(view.mode === 'demo' ? 'Demo mode: saved result' : 'Live result', true);
  announce(`Result ready. ${stamp.action}.`);
}

// The path: every step by deadline. Each step: the finding (Because), the evidence from the files, the rule, who and when.
function renderPath(view) {
  const r = view.result;
  const fm = view.findings;
  const invoiceSignals = view.prov.some((p) => p.role === 'invoice' && checkSignals(p).length);
  const steps = [{ ...fm.stamp, id: 'approve', because: fm.stamp.because, primary: true }, ...fm.alsoNeeded, ...fm.pathOnly.filter((s) => !s.onlyIf || invoiceSignals)]
    .sort((a, b) => a.due.localeCompare(b.due));
  const firstDue = steps[0].due;
  const timing = view.evidence?.resolved.callouts.tuesday;
  const callout = timing ? h('li', { class: 'path-callout' },
    h('p', { class: 'ev-label' }, `Timing for ${formatDay(firstDue)}`),
    ...timing.map((i) => quoteBlock(view, i))) : null;
  const items = steps.flatMap((s, n) => [
    n === 0 ? callout : null,
    h('li', { class: s.primary ? 'primary' : '', 'data-step': s.id },
      h('p', { class: 'path-due' }, formatDay(s.due)),
      h('p', { class: 'path-action' }, s.action),
      h('p', { class: 'path-owner' }, s.owner),
      s.because ? h('p', { class: 'path-because' }, `Because ${s.because.check}: ${s.because.text}`) : null,
      ...stepEvidence(view, evId(s), { amounts: true }),
      view.evidence || !s.basis.length ? ruleBlock(view, s.basis, s.action) : chipRow(s.basis),
      view.evidence ? copyEvidenceButton(view, s, visibleItems(view, evItems(view, evId(s)) ?? [])) : null),
  ]).filter(Boolean);
  show(h('section', { class: 'path' },
    h('h2', {}, 'Path to resolution'),
    h('ol', { class: 'path-list' }, items),
    h('p', { class: 'path-outcome' }, `Written outcome due ${formatDay(r.case.outcomeDue.date)} `, chipRow(r.case.outcomeDue.basis)),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => renderCaseReport(view) }, 'Back to result'))));
  announce('Path to resolution.');
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

$('file-input').addEventListener('change', (e) => { const list = [...e.target.files]; e.target.value = ''; handleFiles(list); });
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); document.body.classList.add('dragging'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  document.body.classList.remove('dragging');
  handleFiles([...e.dataTransfer.files]);
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
  if (current?.evidence) { const { el, button } = current.evidence; el.remove(); button?.setAttribute('aria-expanded', 'false'); current.evidence = null; button?.focus(); return; }
  if (current?.openKey) { const key = current.openKey; closeRow(); $('view').querySelector(`#head-${key}`)?.focus(); return; }
  clearHighlights();
});

function acceptPending(p) {
  if (!p) return;
  pageTabId = p.tabId ?? null;
  pageUrl = p.url ?? '';
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
