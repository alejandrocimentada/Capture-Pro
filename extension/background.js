// Capture Pro — background service worker
// Owns: per-tab on/off state, toolbar icon, preview tabs, and AI API calls (any provider, see providers.js).
importScripts('providers.js');

const MAX_CAPTURE_CHARS = 60000;

const stateKey = (tabId) => `active_${tabId}`;
async function isActive(tabId) {
  const key = stateKey(tabId);
  return (await chrome.storage.session.get(key))[key] ?? false;
}

/* ───────────── Toolbar icon (drawn at runtime, no image files) ───────────── */

function drawIcon(size, active) {
  const s = size;
  const ctx = new OffscreenCanvas(s, s).getContext('2d');
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, active ? '#F97316' : '#57534E');
  g.addColorStop(1, active ? '#FB7185' : '#78716C');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(0, 0, s, s, s * 0.26); ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const a = s * 0.24, b = s * 0.76, l = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(a, a + l); ctx.lineTo(a, a); ctx.lineTo(a + l, a);
  ctx.moveTo(b - l, a); ctx.lineTo(b, a); ctx.lineTo(b, a + l);
  ctx.moveTo(b, b - l); ctx.lineTo(b, b); ctx.lineTo(b - l, b);
  ctx.moveTo(a + l, b); ctx.lineTo(a, b); ctx.lineTo(a, b - l);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.roundRect(s * 0.37, s * 0.37, s * 0.26, s * 0.26, s * 0.05); ctx.fill();
  return ctx.getImageData(0, 0, s, s);
}

async function paintIcon(tabId = null, active = false) {
  const scope = tabId != null ? { tabId } : {};
  await chrome.action.setIcon({ ...scope, imageData: { 16: drawIcon(16, active), 32: drawIcon(32, active) } });
  await chrome.action.setBadgeText({ ...scope, text: active ? 'ON' : '' });
  if (active) {
    await chrome.action.setBadgeBackgroundColor({ ...scope, color: '#0D9488' });
    await chrome.action.setBadgeTextColor?.({ ...scope, color: '#FFFFFF' });
  }
  await chrome.action.setTitle({ ...scope, title: active ? 'Capture Pro: ON' : 'Capture Pro' });
}

chrome.runtime.onInstalled.addListener(() => paintIcon());
chrome.runtime.onStartup.addListener(() => paintIcon());

/* ───────────────────────── Picker on/off ───────────────────────── */

async function setActive(tabId, active) {
  if (active) {
    // Throws on chrome://, the Web Store, etc. Caller turns that into a friendly message.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
  await chrome.tabs.sendMessage(tabId, { type: 'PICKER_SET', active }).catch(() => {});
  await chrome.storage.session.set({ [stateKey(tabId)]: active });
  await paintIcon(tabId, active);
  return active;
}

const toggle = async (tabId) => setActive(tabId, !(await isActive(tabId)));

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (/cannot access|chrome:\/\/|extensions gallery|cannot be scripted|webstore/i.test(msg)) {
    return "Chrome doesn't allow extensions on this page (chrome:// pages, the Web Store, etc.). Try a regular website.";
  }
  return msg;
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-picker' || tab?.id == null) return;
  try { await toggle(tab.id); } catch (err) { console.warn('[Capture Pro]', friendlyError(err)); }
});

// A page load wipes the content script, so reset that tab's state.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading' || !(await isActive(tabId))) return;
  await chrome.tabs.sendMessage(tabId, { type: 'PICKER_SET', active: false }).catch(() => {});
  await chrome.storage.session.set({ [stateKey(tabId)]: false });
  await paintIcon(tabId, false);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(stateKey(tabId));
});

/* ───────────────────────── AI: raw capture → clean component ───────────────────────── */

const SYSTEM_PROMPT = `You are a senior front-end engineer. You receive a raw capture of one UI element from a live web page: its HTML with auto-generated class names (n1, n2, …) and CSS reconstructed from the browser's computed styles. Comments give each element's rendered size (width×height in px), the fonts used, and the source URL. Hover rules come from the page's own stylesheets.

Rewrite it as a clean, self-contained, reusable component in plain HTML + CSS.

Output format:
- Exactly one fenced \`\`\`html code block and nothing else.
- Inside it: a <style> element first, then the markup.
- Start the <style> with a one-line comment describing the component.

Rules:
- Preserve the visual design faithfully: colors, typography, spacing, borders, radii, shadows, gradients, and hover/transition effects.
- Replace the generic class names with short, meaningful BEM-style names under one root class (e.g. .card, .card__title, .card__price).
- Scope every selector under the root class so nothing leaks into a host page. No element-only or global selectors.
- Drop redundant declarations (browser defaults, values children would inherit anyway), merge duplicates, and use shorthands.
- Prefer flexible layout: use max-width, flex/grid, and padding instead of fixed container widths/heights. Keep fixed sizes only where they matter (icons, images, avatars, decorative shapes). Treat the size comments as reference, not requirements.
- Put repeated colors and key values into CSS custom properties on the root class.
- Fonts: if a font is a known Google Font, add an @import for it at the top of the <style>; always end font stacks with a sensible system fallback.
- Keep text content and image URLs exactly as captured; add alt text to images that lack it.
- The capture may contain several separately picked elements wrapped in a .capture-group container. Keep them together as one set: a single root wrapper class, with each piece as its own clearly named block inside it.
- Keep CSS animations: the @keyframes blocks and the animation declarations that use them (rename keyframes to match the component, e.g. hero-fade-up). Wrap the animation declarations in @media (prefers-reduced-motion: no-preference) so users who disable motion aren't affected.
- No JavaScript, no frameworks, no external CSS besides fonts.`;

// Builds the request for either API format. Everything else about the call is the same.
function buildRequest(format, { endpoint, apiKey, model, userText }) {
  if (format === 'anthropic') {
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
    // Anthropic's own API requires this opt-in header for calls made from a browser context.
    if (new URL(endpoint).hostname === 'api.anthropic.com') headers['anthropic-dangerous-direct-browser-access'] = 'true';
    return {
      headers,
      body: { model, max_tokens: 16000, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userText }] },
    };
  }
  return {
    headers: { 'content-type': 'application/json', ...(apiKey && { authorization: `Bearer ${apiKey}` }) },
    body: { model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userText }] },
  };
}

function responseText(format, data) {
  if (format === 'anthropic') {
    if (data.stop_reason === 'refusal') throw new Error('The model declined this request. Try a different element or model.');
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }
  const content = data.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.map((p) => p.text || '').join('') : content || '';
}

async function cleanComponent({ raw, url }) {
  const settings = await chrome.storage.local.get({ provider: '', endpoint: '', format: '', apiKey: '', model: '' });
  // Settings saved before providers existed were for ZenMux.
  if (!settings.provider) settings.provider = settings.apiKey ? 'zenmux' : DEFAULT_PROVIDER;
  const { endpoint, format, model } = resolveProvider(settings);

  // Local servers (Ollama, LM Studio) often need no key, so only Custom may run without one.
  if (!settings.apiKey && settings.provider !== 'custom') return { ok: false, error: 'No API key yet. Add one on the extension Options page.' };
  if (!endpoint || !originPattern(endpoint)) return { ok: false, error: 'No valid API endpoint. Check the extension Options page.' };
  if (!model) return { ok: false, error: 'No model ID yet. Add one on the extension Options page.' };
  if (!(await chrome.permissions.contains({ origins: [originPattern(endpoint)] }))) {
    return { ok: false, error: `Capture Pro needs permission to reach ${new URL(endpoint).hostname}. Open Options and click Save settings.` };
  }
  if (raw.length > MAX_CAPTURE_CHARS) {
    return { ok: false, error: 'This capture is too large for a clean conversion. Press ↓ to pick a smaller part.' };
  }

  const userText = `Source page: ${url}\n\nRaw capture:\n\`\`\`html\n${raw}\n\`\`\``;
  const { headers, body } = buildRequest(format, { endpoint, apiKey: settings.apiKey, model, userText });

  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(180000), headers, body: JSON.stringify(body) });
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'The AI model took too long. Try again.' : `Network error: ${err.message}` };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message || `API error (HTTP ${res.status})` };

  let text;
  try { text = responseText(format, data); } catch (err) { return { ok: false, error: err.message }; }
  const match = text.match(/```html\s*\n([\s\S]*?)```/) || text.match(/```[\w-]*\s*\n([\s\S]*?)```/);
  const code = (match ? match[1] : text.replace(/^```[\w-]*\s*\n/, '')).trim();
  if (!code) return { ok: false, error: 'The AI model returned an empty response. Try again.' };
  return { ok: true, code };
}

/* ───────────────────────── Preview tab ───────────────────────── */

async function openPreview({ html, title, width }, sender) {
  await chrome.storage.session.set({ preview: { html, title: title || 'Component', width: width || null } });
  const tab = { url: chrome.runtime.getURL('preview.html') };
  if (sender.tab) {
    tab.index = sender.tab.index + 1;
    tab.openerTabId = sender.tab.id;
  }
  await chrome.tabs.create(tab);
  return { ok: true };
}

/* ───────────────────────── Message router ───────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'GET_STATE':
        return { active: await isActive(msg.tabId) };
      case 'TOGGLE':
        try { return { ok: true, active: await toggle(msg.tabId) }; }
        catch (err) { return { ok: false, error: friendlyError(err) }; }
      case 'PICKER_EXIT': // user pressed Esc inside the page
        if (sender.tab) {
          await chrome.storage.session.set({ [stateKey(sender.tab.id)]: false });
          await paintIcon(sender.tab.id, false);
        }
        return { ok: true };
      case 'CLEAN_COMPONENT':
        return cleanComponent(msg.payload);
      case 'OPEN_PREVIEW':
        return openPreview(msg.payload, sender);
      default:
        return { ok: false, error: 'Unknown message' };
    }
  })().then(sendResponse, (err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep the channel open for the async response
});
