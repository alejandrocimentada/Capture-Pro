const $ = (id) => document.getElementById(id);
const RESTRICTED = /^(chrome|edge|brave|about|devtools|view-source|chrome-extension):|^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;
const COPY = {
  off: ['Off', 'Turn it on, then click any element on the page.'],
  on: ['Active on this tab', 'Hover and click an element to capture it.'],
  blocked: ['Not available here', "Chrome doesn't allow extensions on this page. Open a regular website."],
};
let tabId = null;

function setState(state) {
  document.body.dataset.state = state;
  $('statusTitle').textContent = COPY[state][0];
  $('statusText').textContent = COPY[state][1];
  $('toggle').setAttribute('aria-checked', String(state === 'on'));
  $('toggle').disabled = state === 'blocked';
}

function showError(message) {
  $('error').textContent = message || 'Something went wrong.';
  $('error').hidden = false;
}

async function refresh() {
  if (tabId == null || document.body.dataset.state === 'blocked') return;
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', tabId });
  setState(state?.active ? 'on' : 'off');
}

$('toggle').addEventListener('click', async () => {
  $('error').hidden = true;
  const res = await chrome.runtime.sendMessage({ type: 'TOGGLE', tabId });
  if (!res?.ok) {
    if (/doesn't allow/i.test(res?.error || '')) return setState('blocked');
    return showError(res?.error);
  }
  setState(res.active ? 'on' : 'off');
  if (res.active) setTimeout(() => window.close(), 350); // get out of the way so the user can pick
});

$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('shortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[`active_${tabId}`]) refresh();
});

(async function init() {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'toggle-picker')?.shortcut;
  $('shortcut').textContent = shortcut || 'Set shortcut';
  $('shortcut').classList.toggle('warn', !shortcut);
  if (tab?.url && RESTRICTED.test(tab.url)) return setState('blocked');
  await refresh();
})();
