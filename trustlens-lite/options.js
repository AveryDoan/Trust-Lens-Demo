const DEFAULTS = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-5-5',
  apiKey: '',
  demoMode: false,
  orgProfile: 'rimpa',
  gmailEnabled: false,
  gmailAddress: '',
};
const $ = (id) => document.getElementById(id);

const saved = await chrome.storage.local.get(DEFAULTS);
$('endpoint').value = saved.endpoint;
$('model').value = saved.model;
$('apiKey').value = saved.apiKey;
$('demoMode').checked = saved.demoMode;
$('orgProfile').value = saved.orgProfile;
$('gmailEnabled').checked = saved.gmailEnabled;
$('gmailAddress').value = saved.gmailAddress;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    endpoint: $('endpoint').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    demoMode: $('demoMode').checked,
    orgProfile: $('orgProfile').value,
    gmailEnabled: $('gmailEnabled').checked,
    gmailAddress: $('gmailAddress').value.trim(),
  });
  $('status').textContent = 'Saved.';
  setTimeout(() => ($('status').textContent = ''), 2000);
});

// ---- Gmail diagnostics: strategies and yes/no flags only. No message text is printed.
$('diag-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const out = $('diag-out');
  const lines = [];
  const say = (s) => { lines.push(s); out.textContent = lines.join('\n'); };
  const s = await chrome.storage.local.get(DEFAULTS);
  say(`Gmail reading enabled: ${s.gmailEnabled ? 'yes' : 'no'}   Address set: ${s.gmailAddress ? 'yes' : 'no'}`);
  const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
  const tab = tabs.find((t) => t.active) ?? tabs[0];
  if (!tab) { say('No Gmail tab is open. Open the test message in Gmail, then run this again.'); return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['gmail-reader.js'] });
    const [{ result: d }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (expected) => globalThis.__tlGmail.diagnostics({ expected }), args: [s.gmailAddress] });
    say(`Account match: ${d.accountMatch} (source: ${d.accountSource})`);
    if (d.accountMatch !== 'match') { say('Stopped: nothing else was read.'); return; }
    say(`Subject found by: ${d.subjectStrategy}`);
    say(`Body found by: ${d.bodyStrategy}`);
    say(`Date source: ${d.dateSource ?? 'none'}   Sender found: ${d.senderFound ? 'yes' : 'no'}`);
    say(`Attachment chips found: ${d.chips?.length ?? 0}`);
    const [{ result: full }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (expected) => globalThis.__tlGmail.read({ expected }).chips?.map((c) => ({ name: c.name, url: c.url })) ?? [], args: [s.gmailAddress] });
    for (const c of d.chips ?? []) {
      say(`  ${c.name}: size ${c.sizePresent ? 'yes' : 'no'}, url ${c.urlPresent ? 'yes' : 'no'}, strategy ${c.strategies.join('+')}`);
      const url = full.find((f) => f.name === c.name)?.url;
      if (!url) { say('    fetch: skipped (no url)'); continue; }
      const r = await chrome.runtime.sendMessage({ type: 'tl-fetch', url });
      say(`    fetch: ${r?.ok ? `status ${r.status}, ${r.bytes} bytes` : `failed (${r?.status ?? 'no status'}) ${r?.error ?? ''}`}`);
    }
  } catch (err) {
    say(`Error: ${err.message}`);
  }
});
