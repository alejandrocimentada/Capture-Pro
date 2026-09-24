const $ = (id) => document.getElementById(id);
let data = null;
let bg = '#ffffff';

/* ───────────── live preview ───────────── */
function renderPreview() {
  if (!data) return;
  // Show the component at its original rendered width so it can be compared with the source page.
  const width = data.width ? `width:${data.width}px;max-width:100%;` : '';
  $('frame').srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:48px 24px;background:${bg}">
<div style="${width}margin:0 auto">${data.html}</div>
</body></html>`;
}

/* ───────────── tiny syntax highlighter (HTML + CSS) ───────────── */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tokenize(text, regex, render) {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(regex)) {
    out += esc(text.slice(last, m.index)) + render(m);
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const CSS_TOKENS = /(\/\*[\s\S]*?\*\/)|(@[\w-]+[^{;]*)|([^\s{};@\/][^{};]*?)(?=\s*\{)|([\w-]+)(\s*:\s*)([^;{}]+)/g;
const HTML_TOKENS = /(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)|([\w:-]+)(=)("[^"]*"|'[^']*')|(\/?>)/g;

const span = (cls, text) => `<span class="${cls}">${esc(text)}</span>`;

const highlightCss = (css) => tokenize(css, CSS_TOKENS, (m) => {
  if (m[1]) return span('t-com', m[1]);
  if (m[2]) return span('t-at', m[2]);
  if (m[3]) return span('t-sel', m[3]);
  return span('t-prop', m[4]) + esc(m[5]) + span('t-val', m[6]);
});

const highlightHtml = (html) => tokenize(html, HTML_TOKENS, (m) => {
  if (m[1]) return span('t-com', m[1]);
  if (m[2]) return span('t-punc', m[2]) + span('t-tag', m[3]);
  if (m[4]) return span('t-attr', m[4]) + esc(m[5]) + span('t-str', m[6]);
  return span('t-punc', m[7]);
});

function highlight(code) {
  const m = code.match(/(<style[^>]*>)([\s\S]*?)(<\/style>)/i);
  if (!m) return highlightHtml(code);
  const end = m.index + m[0].length;
  return highlightHtml(code.slice(0, m.index)) + highlightHtml(m[1]) + highlightCss(m[2])
    + highlightHtml(m[3]) + highlightHtml(code.slice(end));
}

function renderCode() {
  const lines = data.html.split('\n').length;
  $('gutter').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  $('src').innerHTML = highlight(data.html); // every piece of text is escaped by the highlighter
  $('meta').textContent = `${lines} lines · ${(data.html.length / 1024).toFixed(1)} KB`;
}

/* ───────────── controls ───────────── */
$('bg').addEventListener('click', (e) => {
  const value = e.target.dataset?.bg;
  if (!value) return;
  bg = value;
  document.querySelectorAll('#bg button').forEach((b) => b.classList.toggle('active', b === e.target));
  renderPreview();
});

$('toggleCode').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('no-code');
  $('toggleCode').textContent = hidden ? 'Show code' : 'Hide code';
});

$('copy').addEventListener('click', async () => {
  if (!data) return;
  await navigator.clipboard.writeText(data.html);
  $('copy').textContent = 'Copied ✓';
  setTimeout(() => { $('copy').textContent = 'Copy code'; }, 1200);
});

(async function init() {
  const { preview } = await chrome.storage.session.get('preview');
  if (!preview) {
    document.querySelector('main').innerHTML = '<p class="empty">Nothing to preview yet. Capture an element first.</p>';
    return;
  }
  data = preview;
  $('label').textContent = preview.title;
  document.title = `Preview · ${preview.title}`;
  renderPreview();
  renderCode();
})();
