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
