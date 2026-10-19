const DEFAULTS = {
  endpoint: 'https://api.anthropic.com/v1/messages',
  model: 'claude-sonnet-5-5',
  apiKey: '',
  demoMode: false,
};
const $ = (id) => document.getElementById(id);

const saved = await chrome.storage.local.get(DEFAULTS);
$('endpoint').value = saved.endpoint;
$('model').value = saved.model;
$('apiKey').value = saved.apiKey;
$('demoMode').checked = saved.demoMode;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    endpoint: $('endpoint').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    demoMode: $('demoMode').checked,
  });
  $('status').textContent = 'Saved.';
  setTimeout(() => ($('status').textContent = ''), 2000);
});
