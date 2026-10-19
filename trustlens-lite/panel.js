import { scanPii, countByType } from './pii.js';
import { overallAction } from './rules.js';

const MAX_CHARS = 8000;
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const ext = typeof chrome !== 'undefined' && chrome.storage ? chrome : null;
const params = new URLSearchParams(location.hash.slice(1));
const PREVIEW = params.has('state'); // static preview from sample data, never touches the network

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
const CLAIM_UI = {
  supported: { tone: 'ok', icon: 'i-check', word: 'Supported' },
  contradicted: { tone: 'concern', icon: 'i-stop', word: 'Contradicted' },
  unverified: { tone: 'check', icon: 'i-warn', word: 'Unverified' },
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
function icon(id) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#' + id);
  svg.append(use);
  return svg;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
  const s = await (ext
    ? ext.storage.local.get({ endpoint: '', model: '', apiKey: '', demoMode: false })
    : { endpoint: '', model: '', apiKey: '', demoMode: true });
  return s;
}

// ---------- state ----------
let runId = 0;
let current = null; // { result, entryId, decision }

function announce(msg) { $('live').textContent = msg; }
function show(...nodes) { $('view').replaceChildren(...nodes); }

function updateInputMeta() {
  const n = $('text').value.length;
  $('source').textContent = n ? `· ${n.toLocaleString()} characters` : '';
}

async function refreshDemoPill() {
  const { demoMode } = await getSettings();
  $('demo-pill').hidden = !(demoMode || PREVIEW);
}

// ---------- views ----------
function renderEmpty() {
  const hasText = $('text').value.trim().length > 0;
  $('input-wrap').open = true;
  show(h('section', { class: 'message' },
    h('h2', {}, hasText ? 'Ready to check' : 'Nothing checked yet'),
    h('p', {}, hasText
      ? 'The text is below. Choose Run check to assess it.'
      : 'Select text on any page, right-click, and choose “Check with TrustLens”.'),
    hasText ? null : h('p', { class: 'muted' }, 'With nothing selected, the toolbar button checks the main text of the page.'),
  ));
  announce(hasText ? 'Text received. Ready to check.' : 'Nothing checked yet.');
}

function renderLoading() {
  show(h('section', { class: 'skeleton', 'aria-busy': 'true' },
    h('p', { class: 'loading-text' }, 'Checking. This usually takes under 10 seconds.'),
    h('div', { class: 'sk sk-stamp', 'aria-hidden': 'true' }),
    ...[0, 1, 2, 3].map(() => h('div', { class: 'sk-row', 'aria-hidden': 'true' },
      h('div', { class: 'sk sk-line short' }), h('div', { class: 'sk sk-line' }))),
  ));
  announce('Checking the text.');
}

function renderError(message) {
  show(h('section', { class: 'message is-error', role: 'alert' },
    h('h2', {}, 'The check did not finish'),
    h('p', {}, message),
    h('p', {}, 'Check your settings and try again, or try demo mode to see a sample report.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: tryDemo }, 'Try demo mode'),
      h('button', { class: 'btn', type: 'button', onclick: runCheck }, 'Try again'),
    ),
  ));
  announce('The check did not finish. ' + message);
}

function renderPrivacy(findings) {
  if (findings.length === 0) return h('div', { class: 'privacy' }, h('p', { class: 'muted' }, 'No personal data found to mask'));
  const counts = countByType(findings);
  return h('details', { class: 'privacy' },
    h('summary', {}, h('span', { class: 'num' }, `${plural(findings.length, 'item', 'items')} masked before checking`), icon('i-chevron')),
    h('ul', {}, Object.entries(counts).map(([t, n]) =>
      h('li', { class: 'num' }, `${n} ${PII_WORDS[t] || t}${n === 1 ? '' : 's'}`))),
  );
}

function renderStamp(result) {
  const ui = ACTION_UI[result.action];
  const decisionBox = h('div', { class: 'stamp-actions', id: 'decision' });
  const label = h('h2', { class: 'stamp-label', id: 'stamp-label' }, result.label);
  const el = h('section', { class: `stamp tone-${ui.tone}`, 'aria-labelledby': 'stamp-label' },
    h('div', { class: 'stamp-head' }, icon(ui.icon), label),
    h('p', { class: 'stamp-reason' }, result.reason),
    decisionBox,
  );
  renderDecision(decisionBox);
  return el;
}

function renderDecision(box = $('decision'), overriding = false) {
  if (!box) return;
  const d = current?.decision;
  if (d) {
    box.replaceChildren(
      h('p', { class: 'decision-note' }, d.kind === 'followed' ? 'Recorded: you followed the advice.' : `Recorded: you overrode the advice${d.reason ? ` (${d.reason})` : ''}.`),
      h('button', { class: 'btn', type: 'button', onclick: () => setDecision(null) }, 'Undo'),
    );
  } else if (overriding) {
    const input = h('input', { type: 'text', id: 'override-reason', 'aria-label': 'Reason for overriding (optional)', placeholder: 'Reason for overriding (optional)', maxlength: '120' });
    box.replaceChildren(h('div', { class: 'override-form' }, input,
      h('div', { class: 'stamp-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => setDecision({ kind: 'overridden', reason: input.value.trim() }) }, 'Save override'),
        h('button', { class: 'btn', type: 'button', onclick: () => renderDecision(box) }, 'Cancel'))));
    input.focus();
  } else {
    box.replaceChildren(
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => setDecision({ kind: 'followed' }) }, 'Follow advice'),
      h('button', { class: 'btn', type: 'button', onclick: () => renderDecision(box, true) }, 'Override'),
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

function renderFinding([key, name], report, index, openByDefault) {
  const c = report[key];
  const ui = STATUS_UI[c.status];
  const body = h('div', { class: 'finding-body' });

  if (c.evidence.length) {
    body.append(h('h4', {}, 'Quoted from the text'), ...c.evidence.map((q) =>
      h('button', { class: 'quote', type: 'button', disabled: true, 'data-check': key, 'data-quote': q }, q)));
  } else {
    body.append(h('p', { class: 'muted' }, c.status === 'OK' ? 'No quotes were needed.' : 'No exact quote could be confirmed in the text.'));
  }

  if (key === 'accuracy' && c.claims?.length) {
    body.append(h('h4', {}, 'Claims'), h('ul', { class: 'claims' }, c.claims.map((cl) => {
      const cu = CLAIM_UI[cl.label] || CLAIM_UI.unverified;
      return h('li', { class: `claim tone-${cu.tone}` },
        h('span', { class: 'claim-label' }, icon(cu.icon), cu.word),
        h('span', {}, cl.claim),
        h('span', { class: 'claim-source' }, cl.source ? `Policy ${cl.source}` : 'Source unclear'));
    })));
  }
  if (key === 'deception' && c.signals?.length) {
    body.append(h('h4', {}, 'Signals noticed'), h('ul', { class: 'signals' }, c.signals.map((s) => h('li', {}, s))),
      h('p', { class: 'muted' }, 'Signals are not proof of intent.'));
  }
  if (key === 'governance') {
    body.append(h('h4', {}, 'Record details'), h('dl', { class: 'facts' },
      h('dt', {}, 'Classification'), h('dd', {}, c.classification),
      h('dt', {}, 'Retention'), h('dd', {}, c.retention),
      h('dt', {}, 'Can be used with AI'), h('dd', {}, c.ai_use_allowed ? 'Yes' : 'No'),
      h('dt', {}, 'Personal data'), h('dd', {}, c.pii_types.length ? c.pii_types.join(', ').replaceAll('_', ' ') : 'None found'),
      h('dt', {}, 'Policies'), h('dd', { class: 'num' }, c.policy_ids.length ? c.policy_ids.join(', ') : 'None')));
  }
  body.append(h('p', { class: 'next' }, h('strong', {}, 'Next step: '), c.next_step));

  return h('details', { class: `finding tone-${ui.tone}`, style: `--i:${index}`, open: openByDefault },
    h('summary', {},
      h('span', { class: 'name' }, name),
      h('span', { class: 'badge' }, icon(ui.icon), c.status),
      h('span', { class: 'summary-text' }, c.summary),
      h('span', { class: 'row-foot' }, h('span', {}, `${c.confidence[0].toUpperCase()}${c.confidence.slice(1)} confidence`), icon('i-chevron'))),
    body);
}

function renderReport({ report, findings, result, demo }) {
  const firstConcern = CHECKS.findIndex(([k]) => report[k].status === 'Concern');
  show(h('div', { class: 'report' },
    renderStamp(result),
    demo ? h('p', { class: 'demo-note' }, 'Demo mode: this is a sample report, not a check of your text.') : null,
    renderPrivacy(findings),
    h('div', { class: 'hl-bar', id: 'hl-bar', hidden: true }),
    h('div', { class: 'findings' }, CHECKS.map((c, i) => renderFinding(c, report, i, i === firstConcern))),
  ));
  $('input-wrap').open = false;
  announce(`Report ready. Recommended action: ${result.label}.`);
}

async function renderHistory() {
  let history = await load('history', []);
  if (PREVIEW && history.length === 0) {
    const now = Date.now();
    history = [
      { id: 3, ts: now - 3600e3, label: 'Do not distribute until reviewed', decision: { kind: 'followed' } },
      { id: 2, ts: now - 26 * 3600e3, label: 'Verify the source before relying on this', decision: { kind: 'overridden', reason: 'Source confirmed by phone' } },
      { id: 1, ts: now - 50 * 3600e3, label: 'OK to use', decision: null },
    ];
  }
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  show(h('section', { class: 'history' },
    h('h2', {}, 'History'),
    history.length
      ? h('ul', {}, history.map((e) => h('li', {},
        h('span', { class: 'when num' }, fmt.format(e.ts)),
        h('span', { class: 'what' }, e.label),
        h('span', {}, !e.decision ? 'No decision recorded' : e.decision.kind === 'followed' ? 'You followed the advice' : `You overrode the advice${e.decision.reason ? `: ${e.decision.reason}` : ''}`))))
      : h('p', { class: 'message' }, 'No checks yet. Only the action and your decision are kept, never the text.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: backFromHistory }, 'Back'),
      history.length ? h('button', { class: 'btn', type: 'button', onclick: async () => { await save('history', []); renderHistory(); } }, 'Clear history') : null),
  ));
  announce('History.');
}
function backFromHistory() { current?.view ? renderReport(current.view) : renderEmpty(); }

// ---------- running a check ----------
let samples;
async function loadSample() {
  samples ??= await (await fetch('sample-report.json')).json();
  return samples[params.get('sample')] || samples.escalate;
}

async function recordHistory(result) {
  const history = await load('history', []);
  const entry = { id: Date.now(), ts: Date.now(), action: result.action, label: result.label, decision: null };
  await save('history', [entry, ...history].slice(0, 20));
  return entry.id;
}

async function finish(view) {
  current = { view, decision: null, entryId: await recordHistory(view.result) };
  renderReport(view);
  applyHighlights(view.report);
}

// ---------- highlights on the page (content.js does the DOM work) ----------
let pageTabId = null;

async function pageCall(func, args = []) {
  if (!ext || pageTabId == null) return null;
  try {
    const [res] = await ext.scripting.executeScript({ target: { tabId: pageTabId }, func, args });
    return res?.result ?? null;
  } catch { return null; } // tab closed, navigated, or not allowed: highlights are optional
}

async function applyHighlights(report) {
  const quotes = {};
  for (const [key] of CHECKS) quotes[key] = report[key].evidence;
  const res = await pageCall((q) => globalThis.__trustlens?.highlightQuotes(q) ?? null, [quotes]);
  const bar = $('hl-bar');
  if (!res || !bar) return;
  for (const btn of document.querySelectorAll('.quote')) {
    const item = res.items.find((i) => i.check === btn.dataset.check && i.quote === btn.dataset.quote);
    if (item?.id) {
      btn.disabled = false;
      btn.dataset.hid = item.id;
      btn.append(h('span', { class: 'quote-hint' }, 'Show in page'));
    }
  }
  const note = res.highlighted
    ? `${plural(res.highlighted, 'quote', 'quotes')} highlighted on the page.`
    : 'No quotes could be highlighted on this page.';
  bar.replaceChildren(
    h('span', { class: 'num' }, note + (res.highlighted && res.skipped ? ` ${res.skipped} could not be highlighted.` : '')),
    res.highlighted ? h('button', { class: 'link', type: 'button', onclick: clearHighlights }, 'Clear highlights') : null);
  bar.hidden = false;
}

async function clearHighlights() {
  await pageCall(() => globalThis.__trustlens?.clearHighlights() ?? null);
  for (const btn of document.querySelectorAll('.quote[data-hid]')) {
    btn.disabled = true;
    delete btn.dataset.hid;
    btn.querySelector('.quote-hint')?.remove();
  }
  $('hl-bar')?.replaceChildren(h('span', {}, 'Highlights cleared.'));
  announce('Highlights cleared.');
}

$('view').addEventListener('click', (e) => {
  const btn = e.target.closest?.('.quote[data-hid]');
  if (btn) pageCall((id) => globalThis.__trustlens?.scrollToHighlight(id) ?? null, [btn.dataset.hid]);
});

async function tryDemo() {
  if (ext) await ext.storage.local.set({ demoMode: true });
  await refreshDemoPill();
  runCheck();
}

async function runCheck() {
  const id = ++runId;
  const settings = await getSettings();
  const demo = settings.demoMode || PREVIEW;
  renderLoading();
  try {
    let text = $('text').value.trim();
    let sample;
    if (demo) {
      sample = await loadSample();
      text = sample.text;
      $('text').value = text;
      updateInputMeta();
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!text) { renderEmpty(); return; }
    const { maskedText, findings } = scanPii(text.slice(0, MAX_CHARS)); // only maskedText leaves this function
    let report;
    if (demo) {
      report = sample.report;
    } else {
      if (!settings.apiKey) throw new Error('No API key is set.');
      const [{ assess }, { policiesForPrompt }] = await Promise.all([import('./assess.js'), import('./policies.js')]);
      report = await assess(maskedText, policiesForPrompt(), settings);
    }
    if (id !== runId) return;
    await finish({ report, findings, result: overallAction(report, findings), demo });
  } catch (err) {
    if (id === runId) renderError(err.message || String(err));
  }
}

// ---------- wiring ----------
$('run').addEventListener('click', runCheck);
$('settings').addEventListener('click', () => (ext ? ext.runtime.openOptionsPage() : window.open('options.html')));
$('history-link').addEventListener('click', renderHistory);
$('text').addEventListener('input', updateInputMeta);

function acceptPending(p) {
  if (!p) return;
  pageTabId = p.tabId ?? null;
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
