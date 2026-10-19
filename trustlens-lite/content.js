// Injected on demand by background.js. Defines the highlighter once per page, then returns the page text.
// The final expression statement is the value executeScript hands back.
globalThis.__trustlens ??= (() => {
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'IFRAME', 'TITLE']);
  // Tint plus a different underline style per check, so colour is never the only cue.
  const LOOK = {
    bias: { label: 'Bias', bg: '#ffd699', line: 'solid' },
    accuracy: { label: 'Accuracy', bg: '#a8d8ff', line: 'dashed' },
    deception: { label: 'Deception risk', bg: '#f5b3c4', line: 'dotted' },
    governance: { label: 'Governance', bg: '#b8e6b8', line: 'double' },
  };
  const marks = new Map(); // id -> <mark>
  let counter = 0;

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function textNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.namespaceURI !== XHTML || SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (p.closest('mark[data-trustlens]')) return NodeFilter.FILTER_REJECT;
        return n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    return nodes;
  }

  // Whitespace-tolerant, because innerText and selections collapse runs of spaces and line breaks.
  function wrapFirstMatch(check, quote) {
    const re = new RegExp(quote.trim().split(/\s+/).map(escapeRegExp).join('\\s+'));
    for (const node of textNodes()) {
      const m = re.exec(node.data);
      if (!m || node.parentElement.checkVisibility?.({ checkVisibilityCSS: true }) === false) continue;
      const target = node.splitText(m.index);
      target.splitText(m[0].length);
      const mark = document.createElement('mark');
      const look = LOOK[check];
      const id = `tl-${++counter}`;
      mark.setAttribute('data-trustlens', check);
      mark.setAttribute('data-trustlens-id', id);
      mark.setAttribute('title', `TrustLens: ${look.label}`);
      for (const [k, v] of Object.entries({
        'background-color': look.bg, color: '#1a1a1a', padding: '0', margin: '0', display: 'inline',
        'border-radius': '2px', 'text-decoration': `underline ${look.line} #1a1a1a`, 'text-decoration-thickness': '1px',
      })) mark.style.setProperty(k, v);
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
      marks.set(id, mark);
      return id;
    }
    return null;
  }

  function clearHighlights() {
    let removed = 0;
    for (const mark of document.querySelectorAll('mark[data-trustlens]')) {
      const text = mark.firstChild;
      const prev = mark.previousSibling;
      mark.replaceWith(text);
      // Merge the text nodes that splitText created, so the DOM is exactly as it was.
      if (prev && prev.nodeType === Node.TEXT_NODE) { prev.appendData(text.data); text.remove(); }
      const keep = prev && prev.nodeType === Node.TEXT_NODE ? prev : text;
      const next = keep.nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE) { keep.appendData(next.data); next.remove(); }
      removed++;
    }
    marks.clear();
    return removed;
  }

  function highlightQuotes(quotesByCheck) {
    clearHighlights();
    const items = [];
    const seen = new Set();
    for (const [check, quotes] of Object.entries(quotesByCheck || {})) {
      if (!LOOK[check] || !Array.isArray(quotes)) continue;
      for (const quote of quotes) {
        const key = `${check}\n${quote}`;
        if (typeof quote !== 'string' || seen.has(key)) continue;
        seen.add(key);
        let id = null;
        try { if (quote.trim().length >= 3) id = wrapFirstMatch(check, quote); } catch { id = null; }
        items.push({ check, quote, id });
      }
    }
    const highlighted = items.filter((i) => i.id).length;
    return { items, highlighted, skipped: items.length - highlighted };
  }

  function scrollToHighlight(id) {
    const mark = marks.get(id);
    if (!mark || !mark.isConnected) return false;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    mark.scrollIntoView({ block: 'center', inline: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    let flashes = 0;
    const timer = setInterval(() => {
      const on = flashes % 2 === 0;
      mark.style.setProperty('outline', on ? '3px solid #1a1a1a' : 'none');
      mark.style.setProperty('outline-offset', '2px');
      if (++flashes >= 6) { clearInterval(timer); mark.style.removeProperty('outline'); mark.style.removeProperty('outline-offset'); }
    }, 220);
    return true;
  }

  return { highlightQuotes, clearHighlights, scrollToHighlight };
})();

(() => {
  const sel = window.getSelection().toString().trim();
  if (sel) return { text: sel, source: 'selection' };

  const len = (el) => (el.innerText || '').trim().length;
  const article = document.querySelector('article');
  if (article && len(article) > 200) return { text: article.innerText.trim(), source: 'article' };
  const main = document.querySelector('main');
  if (main && len(main) > 200) return { text: main.innerText.trim(), source: 'main' };

  // Largest text block: the container whose direct <p> children hold the most text.
  let best = null;
  let bestScore = 0;
  for (const el of document.querySelectorAll('div, section')) {
    let score = 0;
    for (const child of el.children) if (child.tagName === 'P') score += len(child);
    if (score > bestScore) { best = el; bestScore = score; }
  }
  if (best && bestScore > 200) return { text: best.innerText.trim(), source: 'largest block' };

  return { text: (document.body?.innerText || '').trim(), source: 'page body' };
})();
