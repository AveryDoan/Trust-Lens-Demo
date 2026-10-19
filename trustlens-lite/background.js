const MENU_ID = 'trustlens-check';
const PENDING_KEY = 'pending';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Check with TrustLens',
    contexts: ['selection', 'page'],
  });
});

// sidePanel.open must run inside the user gesture, so call it before any await.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
  sendToPanel(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  chrome.sidePanel.open({ tabId: tab.id });
  sendToPanel(tab, info.selectionText);
});

async function sendToPanel(tab, menuSelection) {
  let payload;
  try {
    // Always inject: it also defines the highlighter the panel calls later.
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    payload = res?.result ?? { text: '', source: 'none' };
  } catch (err) {
    payload = { text: '', source: 'error', error: 'Cannot read this page: ' + err.message };
  }
  if (menuSelection && menuSelection.trim()) payload = { text: menuSelection.trim(), source: 'selection' };
  await chrome.storage.session.set({
    [PENDING_KEY]: { ...payload, tabId: tab.id, title: tab.title || '', url: tab.url || '', ts: Date.now() },
  });
}

// Attachment download for the Gmail reader. Only the two hosts Gmail attachments come from are allowed, and only
// the extension's own pages can ask. The browser's signed-in session is used (credentials: 'include').
const ATTACHMENT_HOSTS = new Set(['mail.google.com', 'mail-attachment.googleusercontent.com']);
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'tl-fetch' || sender.id !== chrome.runtime.id || sender.tab) return false; // not from a web page
  (async () => {
    try {
      const url = new URL(msg.url);
      if (url.protocol !== 'https:' || !ATTACHMENT_HOSTS.has(url.hostname)) { sendResponse({ ok: false, error: 'host not allowed' }); return; }
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) { sendResponse({ ok: false, status: res.status, error: `HTTP ${res.status}` }); return; }
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_ATTACHMENT_BYTES) { sendResponse({ ok: false, status: res.status, error: 'file is larger than 6 MB' }); return; }
      sendResponse({ ok: true, status: res.status, bytes: buffer.byteLength, type: res.headers.get('content-type') || '', base64: toBase64(buffer) });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // the answer is sent asynchronously
});
