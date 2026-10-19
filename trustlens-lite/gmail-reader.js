// Reads the open Gmail message, only when the caller proves the signed-in account is the demo account.
// Plain classic script (injected on demand). Gmail's class names change, so every part tries several strategies
// based on semantics (data-message-id, role, attributes, link patterns) and reports which one worked.
// It uses the page that is already open in the browser's own signed-in session. It never reads or stores credentials.
(() => {
  const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const FILE_RE = /^\s*(.+?\.(?:pdf|docx|txt|md))\s*$/i;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // ---- pure helpers (also tested in Node) ----
  const firstEmail = (s) => EMAIL_RE.exec(String(s ?? ''))?.[0]?.toLowerCase() ?? '';

  // "Mon, Oct 19, 2026, 8:57 PM", "Mon, 19 Oct 2026, 20:57", "19 October 2026 at 20:57" -> { iso: '2026-10-19', time: '20:57' }
  function parseGmailDate(text) {
    const s = String(text ?? '');
    let d, mon, y;
    let m = /(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(s);
    if (m) { d = +m[1]; mon = m[2]; y = +m[3]; }
    else if ((m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) { mon = m[1]; d = +m[2]; y = +m[3]; }
    const mi = mon ? MONTHS.indexOf(mon.toLowerCase().slice(0, 3)) : -1;
    if (mi < 0 || !d || !y) return null;
    const t = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(s.slice(m.index + m[0].length - 1));
    let time = '';
    if (t) { let h = +t[1]; if (/pm/i.test(t[3] ?? '') && h < 12) h += 12; if (/am/i.test(t[3] ?? '') && h === 12) h = 0; time = `${String(h).padStart(2, '0')}:${t[2]}`; }
    return { iso: `${y}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, time };
  }

  // Legacy Gmail attribute download_url="mime:name:url". The name may not contain a colon; the url may.
  function parseDownloadUrlAttr(v) {
    const s = String(v ?? '');
    const a = s.indexOf(':');
    if (a < 0) return null;
    const b = s.indexOf(':', a + 1);
    if (b < 0) return null;
    return { mime: s.slice(0, a), name: s.slice(a + 1, b), url: s.slice(b + 1) };
  }

  const matchAccount = (found, expected) => Boolean(found) && Boolean(expected) && found.toLowerCase() === String(expected).trim().toLowerCase();

  // ---- the signed-in account shown on the page ----
  function account(doc = document) {
    const labelled = [...doc.querySelectorAll('[aria-label*="Google Account"], [aria-label*="Account:"]')];
    for (const el of labelled) { const a = firstEmail(el.getAttribute('aria-label')); if (a) return { address: a, source: 'account button aria-label' }; }
    const t = firstEmail(/([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\s*-\s*Gmail/i.exec(doc.title ?? '')?.[1]);
    if (t) return { address: t, source: 'page title' };
    return { address: '', source: 'none' };
  }

  // ---- text of an element without quoted history or a separated signature ----
  const BLOCK = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'UL', 'OL', 'TABLE']);
  const SKIP = '.gmail_quote, blockquote, .gmail_signature, [data-smartmail], script, style, .adL, .gmail_extra';
  function textOf(root) {
    let out = '';
    const walk = (n) => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1 || n.matches?.(SKIP)) return;
      if (n.tagName === 'BR') { out += '\n'; return; }
      const block = BLOCK.has(n.tagName);
      if (block && out && !out.endsWith('\n')) out += '\n';
      for (const c of n.childNodes) walk(c);
      if (block && !out.endsWith('\n')) out += '\n';
    };
    walk(root);
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '').split(/\n-- ?\n/)[0].trim();
  }

  const visible = (el) => !!el && el.getClientRects().length > 0;

  // ---- subject ----
  function findSubject(doc, main) {
    const strategies = [
      ['h2[data-thread-perm-id]', () => doc.querySelector('h2[data-thread-perm-id]')],
      ['main heading', () => [...(main ?? doc).querySelectorAll('h2')].find((h) => h.textContent.trim().length > 3)],
    ];
    for (const [name, f] of strategies) { const el = f(); if (el?.textContent.trim()) return { text: el.textContent.trim(), source: name }; }
    const t = /^(.*?)\s*-\s*[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*-\s*Gmail/i.exec(doc.title ?? '');
    return t ? { text: t[1].trim(), source: 'page title' } : { text: '', source: 'none' };
  }

  // ---- the expanded message and its body ----
  function findMessage(main) {
    const roots = [...main.querySelectorAll('[data-message-id]')].filter(visible);
    const bodyOf = (m) => {
      const strategies = [['div.a3s (legacy body)', () => m.querySelector('div.a3s')], ['[dir=ltr] block', () => [...m.querySelectorAll('div[dir="ltr"], div[dir="auto"]')].find((d) => d.textContent.trim().length > 40 && !d.closest('[aria-label*="ttachment"]'))]];
      for (const [name, f] of strategies) { const el = f(); if (el && visible(el)) return { el, source: name }; }
      return null;
    };
    for (const m of roots.reverse()) { const b = bodyOf(m); if (b) return { message: m, body: b.el, source: `[data-message-id] + ${b.source}` }; }
    const legacy = [...main.querySelectorAll('div.a3s')].filter(visible).pop();
    if (legacy) return { message: legacy.parentElement, body: legacy, source: 'div.a3s only' };
    // Last resort: the smallest visible block that still holds a message-sized amount of text.
    const best = [...main.querySelectorAll('div')].filter((d) => visible(d) && d.textContent.length > 200).sort((x, y) => x.textContent.length - y.textContent.length)[0];
    return best ? { message: best, body: best, source: 'largest text block' } : null;
  }

  // ---- sender and date ----
  function findSender(message) {
    const el = message.querySelector('span[email], [data-hovercard-id]');
    if (el) return { name: (el.getAttribute('name') || el.textContent).trim(), address: firstEmail(el.getAttribute('email') || el.getAttribute('data-hovercard-id')) };
    const m = /^(.*?)\s*<([^>]+)>/.exec(message.textContent.slice(0, 400));
    return m ? { name: m[1].trim(), address: firstEmail(m[2]) } : { name: '', address: '' };
  }

  function findDate(message, bodyText, today) {
    for (const el of message.querySelectorAll('[title], [aria-label], [data-tooltip]')) {
      for (const attr of ['title', 'aria-label', 'data-tooltip']) {
        const p = parseGmailDate(el.getAttribute(attr) || '');
        if (p) return { ...p, source: `element ${attr}` };
      }
    }
    // Only a labelled date counts ("Date: ...", "Sent: ..."); any other date in the text is about something else.
    const labelled = /(?:^|\n)\s*(?:Date|Sent)\s*:\s*([^\n]{0,60}\d{4}[^\n]{0,20})/i.exec(bodyText)?.[1];
    const inBody = labelled ? parseGmailDate(labelled) : null;
    if (inBody) return { ...inBody, source: 'body text' };
    return { iso: today, time: '', source: 'today (fallback)' };
  }

  // ---- attachment chips ----
  function findChips(root, only) {
    const found = new Map();
    // "Preview attachment x.pdf", "Download attachment x.pdf" and "x.pdf" are one file.
    const tidy = (n) => String(n).replace(/^\s*(?:(?:preview|download|open)\s+)?attachment[:\s]+/i, '').replace(/^\s*(?:preview|download|open)\s+/i, '').replace(/\s+/g, ' ').trim();
    const add = (name0, size, url, strategy) => {
      const name = tidy(name0);
      const key = name.toLowerCase();
      const e = found.get(key) ?? { name, size: '', url: '', strategies: [] };
      if (size && !e.size) e.size = size;
      if (url && !e.url) e.url = url;
      if (!e.strategies.includes(strategy)) e.strategies.push(strategy);
      found.set(key, e);
    };
    const sizeIn = (el) => /(?<![\d.])\d+(?:\.\d+)?\s?(?:KB|MB|GB|B)\b/i.exec(el?.textContent ?? '')?.[0] ?? '';
    const all = (s) => !only || only.includes(s);
    if (all('download_url')) for (const el of root.querySelectorAll('[download_url]')) { const p = parseDownloadUrlAttr(el.getAttribute('download_url')); if (p?.name) add(p.name, sizeIn(el), p.url, 'download_url'); }
    if (all('view=att')) for (const a of root.querySelectorAll('a[href*="view=att"]')) {
      const label = a.getAttribute('aria-label') || a.textContent || '';
      const name = FILE_RE.exec(label.replace(/^\s*Download attachment\s*/i, ''))?.[1] ?? FILE_RE.exec(a.closest('[aria-label]')?.getAttribute('aria-label')?.replace(/^\s*Attachment:?\s*/i, '') ?? '')?.[1];
      if (name) add(name.trim(), sizeIn(a.parentElement), a.href, 'view=att');
    }
    if (all('dom chip')) for (const el of root.querySelectorAll('div, span, a')) {
      if (el.children.length > 6) continue;
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim() || (el.children.length === 0 ? el.textContent : '');
      const name = FILE_RE.exec(own)?.[1];
      if (!name || name.length > 120) continue;
      const holder = el.closest('div[role="listitem"], div[aria-label], div, li') ?? el.parentElement;
      const scope = holder?.parentElement ?? holder;
      // Size: from the chip itself (the parent), but only if that parent holds a single file name.
      const parent = el.parentElement;
      const single = parent && (parent.textContent.match(/\.(?:pdf|docx|txt|md)(?![a-z])/gi) || []).length === 1;
      if (scope?.querySelector('[aria-label*="ownload"], [data-tooltip*="ownload"], [download_url]') || el.closest('[aria-label*="ttachment"]')) add(name, single ? sizeIn(parent) : '', '', 'dom chip');
    }
    return [...found.values()];
  }

  // ---- public entry points ----
  const guard = (expected, doc) => {
    const acc = account(doc);
    return { ok: matchAccount(acc.address, expected), acc };
  };

  function read({ expected, strategies, today } = {}, doc = document) {
    const g = guard(expected, doc);
    if (!g.ok) return { ok: false, reason: expected ? 'account-mismatch' : 'no-expected-address' }; // nothing else is read
    const main = doc.querySelector('[role="main"]') ?? doc.body;
    const found = findMessage(main);
    if (!found) return { ok: false, reason: 'no-open-message' };
    const body = textOf(found.body);
    const subject = findSubject(doc, main);
    const sender = findSender(found.message);
    const date = findDate(found.message, body, today ?? new Date().toISOString().slice(0, 10));
    const chips = findChips(found.message.closest('[role="main"]') ?? main, strategies);
    return { ok: true, subject: subject.text, sender, date, body, chips, debug: [`body: ${found.source}`, `subject: ${subject.source}`, `date: ${date.source}`, ...chips.map((c) => `chip ${c.name}: ${c.strategies.join('+')}`)] };
  }

  // No message text is returned: only which strategies worked.
  function diagnostics({ expected } = {}, doc = document) {
    const g = guard(expected, doc);
    const out = { accountMatch: g.ok ? 'match' : g.acc.address ? 'no match' : 'no account found', accountSource: g.acc.source, expectedSet: Boolean(expected) };
    if (!g.ok) return out;
    const main = doc.querySelector('[role="main"]') ?? doc.body;
    const found = findMessage(main);
    out.bodyStrategy = found ? found.source : 'none';
    out.subjectStrategy = findSubject(doc, main).source;
    if (found) {
      out.dateSource = findDate(found.message, textOf(found.body), 'x').source;
      out.senderFound = Boolean(findSender(found.message).address);
      out.chips = findChips(found.message.closest('[role="main"]') ?? main).map((c) => ({ name: c.name, sizePresent: Boolean(c.size), urlPresent: Boolean(c.url), strategies: c.strategies }));
    }
    return out;
  }

  globalThis.__tlGmail = { read, diagnostics, account, parseGmailDate, parseDownloadUrlAttr, matchAccount, firstEmail, textOf, findChips };
})();
