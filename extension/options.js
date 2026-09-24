const $ = (id) => document.getElementById(id);

// Show the preset's endpoint (read-only) or let the user type one for "Custom".
function renderProvider() {
  const key = $('provider').value;
  const preset = PROVIDERS[key];
  const custom = key === 'custom';
  $('endpoint').readOnly = !custom;
  if (!custom) $('endpoint').value = preset.endpoint;
  $('formatField').hidden = !custom;
  $('model').placeholder = preset.model ? `e.g. ${preset.model}` : 'Model ID from your provider';
}

async function load() {
  for (const [key, { label }] of Object.entries(PROVIDERS)) {
    $('provider').append(new Option(label, key));
  }
  const s = await chrome.storage.local.get({ provider: '', endpoint: '', format: 'openai', apiKey: '', model: '' });
  // Settings saved before providers existed were for ZenMux.
  $('provider').value = s.provider || (s.apiKey ? 'zenmux' : DEFAULT_PROVIDER);
  $('endpoint').value = s.endpoint;
  $('format').value = s.format;
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  renderProvider();
}

function showStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

$('provider').addEventListener('change', () => {
  $('model').value = ''; // model IDs differ between providers
  if ($('provider').value === 'custom') $('endpoint').value = '';
  renderProvider();
});

$('reveal').addEventListener('click', () => {
  const input = $('apiKey');
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  $('reveal').textContent = hidden ? 'Hide' : 'Show';
});

$('save').addEventListener('click', () => {
  const provider = $('provider').value;
  const settings = {
    provider,
    endpoint: provider === 'custom' ? $('endpoint').value.trim() : '',
    format: $('format').value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
  };
  const { endpoint } = resolveProvider(settings);
  const pattern = originPattern(endpoint);
  if (!pattern) return showStatus('Enter a valid http(s) API endpoint.', true);

  // permissions.request must run directly in the click handler, before any await.
  chrome.permissions.request({ origins: [pattern] }, async (granted) => {
    await chrome.storage.local.set(settings);
    if (!granted) return showStatus(`Saved, but Capture Pro can't reach ${new URL(endpoint).hostname} without permission.`, true);
    showStatus('Saved ✓');
    setTimeout(async () => {
      const tab = await chrome.tabs.getCurrent();
      if (tab) chrome.tabs.remove(tab.id);
      else window.close();
    }, 700);
  });
});

load();
