// Capture Pro — content script (injected on demand by background.js)
// Hover to highlight, click to capture an element's HTML + the CSS that makes it look the way it does.
// Ctrl/Cmd + click selects multiple elements.
(() => {
  if (window.__captureProLoaded) return; // guard against double injection
  window.__captureProLoaded = true;

  const XHTML_NS = 'http://www.w3.org/1999/xhtml';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAX_ELEMENTS = 600;

  /* ───────────────────────── tiny DOM helper ───────────────────────── */
  function h(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...kids.filter((k) => k != null));
    return node;
  }

  /* ═══════════════════════ 1. Style capture engine ═══════════════════════ */

  const SIDES = ['top', 'right', 'bottom', 'left'];
  const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

  // Compared against the parent (they inherit), not against browser defaults.
  const INHERITED = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'letter-spacing', 'text-align', 'text-transform', 'text-shadow', 'white-space', 'word-break',
    'list-style-type', 'cursor', 'fill', 'stroke', 'stroke-width', 'box-sizing'];
  const VISUAL = ['display', 'vertical-align', 'min-width', 'max-width', 'min-height', 'max-height',
    'aspect-ratio', 'object-fit', 'object-position', 'background-color', 'background-image',
    'background-clip', 'text-decoration-line', 'text-overflow', 'opacity', 'box-shadow', 'transform',
    'transition', 'filter', 'backdrop-filter', 'mix-blend-mode', 'clip-path', 'z-index', 'float',
    '-webkit-line-clamp', '-webkit-box-orient'];
  const BG_DETAILS = ['background-size', 'background-position', 'background-repeat'];
  const ANIMATION = ['animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay',
    'animation-iteration-count', 'animation-direction', 'animation-fill-mode'];
  const OFFSETS = ['top', 'right', 'bottom', 'left'];
  const CONTAINER = ['flex-direction', 'flex-wrap', 'justify-content', 'justify-items', 'align-items',
    'align-content', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow'];
  const ITEM = ['flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'justify-self', 'order',
    'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end'];
  const BOX = SIDES.flatMap((s) => [`margin-${s}`, `padding-${s}`, `border-${s}-width`, `border-${s}-style`, `border-${s}-color`]);
  const ALL_PROPS = [...new Set([...INHERITED, ...VISUAL, ...BG_DETAILS, ...ANIMATION, ...OFFSETS, ...CONTAINER, ...ITEM, ...BOX,
    '-webkit-text-fill-color',
    ...CORNERS.map((c) => `border-${c}-radius`),
    'position', 'width', 'height', 'overflow-x', 'overflow-y', 'row-gap', 'column-gap'])];

  const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'picture', 'iframe', 'input', 'textarea', 'select', 'hr']);
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'source']);
  const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'type', 'placeholder', 'value', 'for', 'name', 'role',
    'colspan', 'rowspan', 'target', 'rel', 'width', 'height', 'disabled', 'checked', 'selected', 'datetime', 'lang', 'dir']);

  const readStyles = (cs) => Object.fromEntries(ALL_PROPS.map((p) => [p, cs.getPropertyValue(p)]));

  // Browser default styles per tag, measured in a blank hidden iframe (no page CSS).
  let defaultsFrame = null;
  const defaultsCache = new Map();
  function defaultsFor(tag, ns) {
    const key = `${ns}|${tag}`;
    if (defaultsCache.has(key)) return defaultsCache.get(key);
    if (!defaultsFrame) {
      defaultsFrame = h('iframe', { class: 'probe', 'aria-hidden': 'true', tabindex: '-1' });
      shadow.append(defaultsFrame);
    }
    const doc = defaultsFrame.contentDocument;
    const probe = doc.createElementNS(ns || XHTML_NS, tag);
    (doc.body || doc.documentElement).append(probe);
    const styles = readStyles(doc.defaultView.getComputedStyle(probe));
    probe.remove();
    defaultsCache.set(key, styles);
    return styles;
  }

  function compress([a, b, c, d]) {
    if (a === b && b === c && c === d) return a;
    if (a === c && b === d) return `${a} ${b}`;
    if (b === d) return `${a} ${b} ${c}`;
    return `${a} ${b} ${c} ${d}`;
  }

  function declarations(s, d, parent, { root = false, fixedSize = false } = {}) {
    const out = [];
    const put = (p, v) => out.push(`${p}: ${v}`);
    const flexOrGrid = (v) => /flex|grid/.test(v || '');

    for (const p of INHERITED) if (s[p] !== (parent ? parent[p] : d[p])) put(p, s[p]);
    for (const p of VISUAL) if (s[p] !== d[p]) put(p, s[p]);
    if (s['background-image'] !== 'none') for (const p of BG_DETAILS) if (s[p] !== d[p]) put(p, s[p]);
    if (s['animation-name'] && s['animation-name'] !== 'none') for (const p of ANIMATION) put(p, s[p]);
    const fill = s['-webkit-text-fill-color']; // gradient text uses a transparent fill
    if (fill !== s.color && (!parent || fill !== parent['-webkit-text-fill-color'])) put('-webkit-text-fill-color', fill);

    if (flexOrGrid(s.display)) {
      for (const p of CONTAINER) if (s[p] !== d[p]) put(p, s[p]);
      const [rg, cg] = [s['row-gap'], s['column-gap']];
      if (rg !== 'normal' || cg !== 'normal') put('gap', rg === cg ? rg : `${rg} ${cg}`);
    }
    if (parent && flexOrGrid(parent.display)) for (const p of ITEM) if (s[p] !== d[p]) put(p, s[p]);

    // Positioning (a picked root keeps no page-relative offsets)
    if (s.position !== 'static' && !(root && /absolute|fixed/.test(s.position))) {
      put('position', s.position);
      if (!root) {
        for (const p of OFFSETS) {
          if (s[p] !== 'auto' && !(s.position === 'relative' && s[p] === '0px')) put(p, s[p]);
        }
      }
    }

    const [ox, oy] = [s['overflow-x'], s['overflow-y']];
    if (ox !== 'visible' || oy !== 'visible') put('overflow', ox === oy ? ox : `${ox} ${oy}`);

    if (fixedSize && s.display !== 'inline') { put('width', s.width); put('height', s.height); }

    for (const box of root ? ['padding'] : ['margin', 'padding']) {
      const vals = SIDES.map((side) => s[`${box}-${side}`]);
      if (vals.some((v, i) => v !== d[`${box}-${SIDES[i]}`])) put(box, compress(vals));
    }

    const borders = SIDES.map((side) => {
      const w = s[`border-${side}-width`];
      const st = s[`border-${side}-style`];
      return st === 'none' || st === 'hidden' || w === '0px' ? 'none' : `${w} ${st} ${s[`border-${side}-color`]}`;
    });
    if (borders.some((b) => b !== 'none')) {
      if (borders.every((b) => b === borders[0])) put('border', borders[0]);
      else SIDES.forEach((side, i) => put(`border-${side}`, borders[i]));
    } else if (d['border-top-style'] !== 'none') {
      put('border', 'none'); // e.g. buttons/inputs with their default border removed
    }

    const radii = CORNERS.map((c) => s[`border-${c}-radius`]);
    if (radii.some((r) => r !== '0px')) put('border-radius', compress(radii));

    return out;
  }

  function cleanAttributes(orig, copy) {
    const svg = copy.namespaceURI === SVG_NS;
    for (const { name } of Array.from(copy.attributes)) {
      const drop = name === 'class' || name === 'style' || name.startsWith('on') || name.startsWith('data-')
        || (!svg && !(KEEP_ATTRS.has(name) || name.startsWith('aria-')));
      if (drop) copy.removeAttribute(name);
    }
    // Make URLs absolute so the component works anywhere
    if (orig.localName === 'img') copy.setAttribute('src', orig.currentSrc || orig.src);
    if (orig.localName === 'a' && typeof orig.href === 'string' && orig.getAttribute('href')) copy.setAttribute('href', orig.href);
  }

  // :hover rules and @keyframes from same-origin stylesheets (cross-origin sheets can't be read).
  function collectRules() {
    const hover = [];
    const keyframes = new Map();
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          keyframes.set(rule.name, rule.cssText);
        } else if ('selectorText' in rule) {
          if (rule.selectorText.includes(':hover')) hover.push(rule);
        } else if (rule.cssRules) {
          visit(rule.cssRules); // @media, @supports, @layer
        } else if (rule.styleSheet) {
          try { visit(rule.styleSheet.cssRules); } catch { /* cross-origin @import */ }
        }
      }
    };
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      try { visit(sheet.cssRules); } catch { /* cross-origin stylesheet */ }
    }
    return { hover, keyframes };
  }

  function noteAnimations(styles, ctx) {
    const names = styles['animation-name'];
    if (names && names !== 'none') names.split(',').forEach((n) => ctx.animations.add(n.trim()));
  }

  // Captures one picked element (and everything inside it) into ctx; returns the cleaned clone.
  function captureTree(root, ctx) {
    const origs = [root, ...root.querySelectorAll('*')];
    const clone = root.cloneNode(true);
    const clones = [clone, ...clone.querySelectorAll('*')]; // same document order as origs
    const styleOf = new Map();
    const skipped = new Set();

    origs.forEach((orig, i) => {
      const copy = clones[i];
      const tag = orig.localName;
      if (orig !== root && skipped.has(orig.parentElement)) { skipped.add(orig); return; }

      const cs = getComputedStyle(orig);
      if (orig === host || SKIP_TAGS.has(tag) || (orig !== root && cs.display === 'none')) {
        skipped.add(orig);
        copy.remove();
        return;
      }

      ctx.kept++;
      const s = readStyles(cs);
      noteAnimations(s, ctx);
      styleOf.set(orig, s);
      const parentStyles = orig === root ? null : styleOf.get(orig.parentElement);
      const isHtml = orig.namespaceURI === XHTML_NS;
      const isEmpty = !orig.children.length && !orig.textContent.trim();
      const fixedSize = tag === 'svg' || (isHtml && (REPLACED.has(tag) || isEmpty));
      const decls = declarations(s, defaultsFor(tag, orig.namespaceURI), parentStyles, { root: orig === root, fixedSize });
      if (!parentStyles || parentStyles['font-family'] !== s['font-family']) ctx.fonts.add(s['font-family']);

      const cls = `n${ctx.classCount + 1}`;
      const extra = [];

      // ::before / ::after decorations
      for (const pseudo of ['::before', '::after']) {
        const pcs = getComputedStyle(orig, pseudo);
        const content = pcs.getPropertyValue('content');
        if (!content || content === 'none' || content === 'normal') continue;
        const ps = readStyles(pcs);
        noteAnimations(ps, ctx);
        const pdecls = declarations(ps, defaultsFor('span', XHTML_NS), s, { fixedSize: ps.display !== 'inline' });
        extra.push(`.${cls}${pseudo} {\n  content: ${content};${pdecls.map((x) => `\n  ${x};`).join('')}\n}`);
      }

      // Hover effects that target this element directly
      for (const rule of ctx.hover) {
        const matched = rule.selectorText.split(',').some((part) => {
          const sel = part.trim();
          if (!sel.endsWith(':hover')) return false;
          try { return orig.matches(sel.slice(0, -':hover'.length) || '*'); } catch { return false; }
        });
        if (!matched) continue;
        ctx.hoverCount++;
        extra.push(`.${cls}:hover { ${rule.style.cssText} }`);
        for (const m of rule.style.cssText.matchAll(/var\((--[\w-]+)/g)) ctx.vars.set(m[1], cs.getPropertyValue(m[1]).trim());
      }

      cleanAttributes(orig, copy);
      if (decls.length || extra.length) {
        ctx.classCount++;
        copy.setAttribute('class', cls);
        const r = orig.getBoundingClientRect();
        ctx.rules.push(`.${cls} { /* ${Math.round(r.width)}×${Math.round(r.height)} */${decls.map((x) => `\n  ${x};`).join('')}\n}`, ...extra);
      }
    });

    return clone;
  }

  function capture(roots) {
    const total = roots.reduce((n, r) => n + 1 + r.querySelectorAll('*').length, 0);
    if (total > MAX_ELEMENTS) {
      return { error: `Your selection contains ${total} nested elements, too many to copy cleanly. Pick smaller parts (↓ moves into a child).` };
    }

    const { hover, keyframes } = collectRules();
    const ctx = { hover, keyframes, animations: new Set(), rules: [], vars: new Map(), fonts: new Set(), classCount: 0, kept: 0, hoverCount: 0 };
    const clones = roots.map((root) => captureTree(root, ctx));
    const multi = clones.length > 1;

    const header = [
      `/* Captured from ${location.href} */`,
      `/* Fonts used: ${[...ctx.fonts].join(' | ') || 'n/a'} */`,
      '/* Class names are auto-generated. Size comments = rendered width×height in px. */',
    ];
    if (multi) header.push(`/* ${clones.length} separately picked elements, wrapped in .capture-group */`);
    if (ctx.vars.size) header.push(`:root {${[...ctx.vars].map(([k, v]) => `\n  ${k}: ${v};`).join('')}\n}`);
    for (const name of ctx.animations) {
      header.push(ctx.keyframes.get(name) || `/* @keyframes ${name}: not readable (defined in a cross-origin stylesheet) */`);
    }
    if (multi) header.push('.capture-group {\n  display: flex;\n  flex-direction: column;\n  gap: 24px;\n}');

    const markup = multi
      ? `<div class="capture-group">\n${clones.map((c) => c.outerHTML).join('\n')}\n</div>`
      : clones[0].outerHTML;
    const html = `<style>\n${[...header, ...ctx.rules].join('\n')}\n</style>\n${markup}`;

    return {
      html,
      width: Math.max(...roots.map((r) => Math.round(r.getBoundingClientRect().width))),
      markup: markup.replace(/\s+/g, ' ').slice(0, 160),
      stats: { elements: ctx.kept, rules: ctx.rules.length, hover: ctx.hoverCount, animations: ctx.animations.size, kb: (html.length / 1024).toFixed(1) },
    };
  }

  /* ═══════════════════════ 2. UI (Shadow DOM) ═══════════════════════ */

  const STYLES = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .shield { position: fixed; inset: 0; cursor: crosshair; background: transparent; }
    .probe { position: fixed; width: 0; height: 0; border: 0; visibility: hidden; pointer-events: none; }

    .box { position: fixed; top: 0; left: 0; pointer-events: none; border-radius: 6px; opacity: 0;
      transition: top 90ms ease-out, left 90ms ease-out, width 90ms ease-out, height 90ms ease-out, opacity 120ms; }
    .box.show { opacity: 1; }
    .box.hover { border: 2px solid #F97316; background: rgba(249,115,22,.10); box-shadow: 0 0 0 4px rgba(249,115,22,.16); }
    .box.hover.adding { border-style: dashed; }
    .box.selected { border: 2px solid #0D9488; background: rgba(13,148,136,.10); box-shadow: 0 0 0 4px rgba(13,148,136,.16); }
    .tag { position: absolute; left: -2px; bottom: calc(100% + 6px); max-width: 420px; padding: 4px 8px; border-radius: 6px;
      background: #F97316; color: #FFFFFF; font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 14px rgba(28,25,23,.18); }
    .tag.inside { bottom: auto; top: 4px; left: 4px; }
    .tag .dim { font-weight: 400; opacity: .85; margin-left: 8px; }

    .pill { position: fixed; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; padding: 8px 14px;
      border-radius: 999px; background: rgba(255,255,255,.97); color: #1C1917; border: 1px solid #E7E5E4;
      font: 500 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 8px 24px rgba(28,25,23,.14);
      pointer-events: none; }
    .pill .muted { color: #78716C; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #F97316; animation: pulse 1.6s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(249,115,22,.55); } 70%, 100% { box-shadow: 0 0 0 8px rgba(249,115,22,0); } }

    .toast { position: fixed; width: 420px; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto;
      padding: 16px; border-radius: 16px; background: #FFFFFF; color: #1C1917; color-scheme: light;
      border: 1px solid #E7E5E4; box-shadow: 0 24px 60px rgba(28,25,23,.18), 0 0 0 1px rgba(249,115,22,.10);
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: default; animation: pop 140ms ease-out; }
    @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.98); } }
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .title { flex: 1; font-weight: 650; }
    .chip { font: 600 11px/1 ui-monospace, Menlo, Consolas, monospace; color: #C2410C; background: #FFF7ED;
      border: 1px solid #FED7AA; padding: 4px 6px; border-radius: 6px; }
    .icon { all: unset; cursor: pointer; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: #A8A29E; }
    .icon:hover { background: #F5F5F4; color: #1C1917; }
    .stats { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
    .stat { padding: 3px 9px; border-radius: 999px; background: #F5F5F4; color: #78716C; font-size: 11px; }
    .stat b { color: #1C1917; font-weight: 650; }
    .hint { margin-bottom: 12px; font-size: 11px; color: #A8A29E; }
    .row { margin-bottom: 12px; }
    .row-head { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px;
      text-transform: uppercase; letter-spacing: .06em; color: #78716C; }
    .row-head .muted { text-transform: none; letter-spacing: 0; color: #A8A29E; }
    .row-body { display: flex; gap: 6px; }
    code.sel { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 8px; background: #FAFAF9; border: 1px solid #E7E5E4;
      color: #44403C; font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btn { all: unset; box-sizing: border-box; cursor: pointer; padding: 0 12px; min-height: 32px; display: inline-flex;
      align-items: center; justify-content: center; border-radius: 8px; background: #F5F5F4; color: #1C1917; border: 1px solid #E7E5E4;
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; transition: background 120ms, transform 80ms; }
    .btn:hover { background: #E7E5E4; }
    .btn:active { transform: scale(.97); }
    .btn.done { background: #CCFBF1; color: #0F766E; border-color: #99F6E4; }
    .btn.primary { display: flex; width: 100%; min-height: 38px; border: none; color: #FFFFFF;
      background: linear-gradient(135deg, #F97316, #FB7185); box-shadow: 0 6px 16px rgba(249,115,22,.28); }
    .btn.primary:hover { filter: brightness(1.05); background: linear-gradient(135deg, #F97316, #FB7185); }
    .btn[disabled] { opacity: .7; cursor: progress; }
    .ai { padding-top: 12px; border-top: 1px solid #F0EEEC; }
    .ai-label { margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #78716C; }
    .ai-out { margin-top: 10px; border-radius: 10px; overflow: hidden; background: #FAFAF9; border: 1px solid #E7E5E4; }
    .ai-bar { display: flex; justify-content: space-between; align-items: center; padding: 6px 6px 6px 10px; color: #78716C;
      font: 11px ui-monospace, Menlo, Consolas, monospace; background: #F5F5F4; border-bottom: 1px solid #E7E5E4; }
    .ai-bar .btn { min-height: 26px; background: #FFFFFF; }
    .btns { display: flex; gap: 6px; }
    pre { margin: 0; padding: 10px; max-height: 300px; overflow: auto; }
    pre code { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #292524; white-space: pre; }
    .skeleton { height: 140px; background: linear-gradient(90deg, #FAFAF9 0%, #EEEBE8 50%, #FAFAF9 100%);
      background-size: 200% 100%; animation: shimmer 1.1s linear infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    .error { padding: 10px; border-radius: 8px; background: #FEF2F2; color: #B91C1C; font-size: 12px; }
  `;

  const host = document.createElement('capture-pro');
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES); // constructable sheets aren't blocked by page CSP
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    shadow.append(h('style', { text: STYLES }));
  }

  // The shield sits over the page while picking: the page never receives hover/clicks,
  // so its :hover styles don't leak into the capture and links don't navigate.
  const shield = h('div', { class: 'shield' });
  const selLayer = h('div');
  const hoverTag = h('div', { class: 'tag' });
  const hoverBox = h('div', { class: 'box hover' }, hoverTag);
  const pillHint = h('span', { class: 'muted' });
  const pill = h('div', { class: 'pill' }, h('span', { class: 'dot' }), h('b', { text: 'Capture Pro' }), pillHint);
  const toast = h('div', { class: 'toast' });
  toast.hidden = true;
  shadow.append(shield, selLayer, hoverBox, pill, toast);

  // Keep clicks/keys inside our UI from bubbling out to the page's handlers.
  ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress']
    .forEach((t) => shadow.addEventListener(t, (e) => e.stopPropagation()));

  /* ───────────────────────── state ───────────────────────── */
  let active = false;
  let hovered = null;
  let selection = [];   // picked elements, in document order
  let cap = null;       // capture of the current selection
  let ctrlDown = false; // Ctrl (or Cmd on Mac) held = multi-select mode
  let anchor = { x: 0, y: 0 };
  let lastPoint = null;
  let raf = 0;
  const selectBoxes = [];

  const locked = () => selection.length > 0;
  const hoverAllowed = () => !locked() || ctrlDown; // no purple hover while a selection is locked, unless adding

  // If the extension was reloaded, this copy of the script is orphaned: shut it down quietly.
  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      disable();
      return Promise.resolve(null);
    }
  }

  /* ───────────────────────── painting ───────────────────────── */
  function describe(el) {
    let s = el.localName;
    if (el.id) s += '#' + el.id;
    const cls = Array.from(el.classList).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  }

  function place(box, el) {
    if (!el || !el.isConnected) { box.classList.remove('show'); return null; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.classList.add('show');
    return r;
  }

  function paint() {
    // Purple hover box
    const r = place(hoverBox, hovered && hoverAllowed() ? hovered : null);
    if (r) {
      const prefix = !locked() ? '' : selection.includes(hovered) ? '− remove  ' : '+ add  ';
      hoverTag.replaceChildren(document.createTextNode(prefix + describe(hovered)),
        h('span', { class: 'dim', text: `${Math.round(r.width)}×${Math.round(r.height)}` }));
      hoverTag.classList.toggle('inside', r.top < 28);
      hoverBox.classList.toggle('adding', locked());
    }
    // One green box per selected element
    while (selectBoxes.length < selection.length) {
      const box = h('div', { class: 'box selected' });
      selLayer.append(box);
      selectBoxes.push(box);
    }
    selectBoxes.forEach((box, i) => place(box, selection[i] || null));
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }

  function updatePill() {
    pillHint.textContent = locked()
      ? 'hold Ctrl to add/remove · click page to clear · Esc to clear'
      : 'click to capture · Ctrl+click for multiple · ↑↓ parent/child · Esc to exit';
  }

  const elementAt = (x, y) =>
    document.elementsFromPoint(x, y).find((n) => n !== host && n !== document.documentElement) || null;

  /* ───────────────────────── selection ───────────────────────── */
  function commit(x, y) {
    if (!selection.length) return clearSelection();
    selection.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (x != null) anchor = { x, y };
    cap = capture(selection);
    renderToast();
    updatePill();
    schedule();
  }

  function selectOnly(el, x, y) {
    if (!(el instanceof Element) || el === host) return;
    selection = [el];
    commit(x, y);
  }

  function toggleSelect(el, x, y) {
    if (!(el instanceof Element) || el === host) return;
    if (selection.includes(el)) {
      selection = selection.filter((s) => s !== el);               // Ctrl+click a green element = remove it
    } else if (selection.some((s) => s.contains(el))) {
      return;                                                       // already included inside a selected element
    } else {
      selection = [...selection.filter((s) => !el.contains(s)), el]; // a parent replaces its selected children
    }
    commit(x, y);
  }

  function clearSelection() {
    selection = [];
    cap = null;
    toast.hidden = true;
    updatePill();
    schedule();
  }

  /* ───────────────────────── toast ───────────────────────── */
  function positionToast() {
    const pad = 12, gap = 14;
    const { width: w, height: ht } = toast.getBoundingClientRect();
    let left = anchor.x + gap;
    let top = anchor.y + gap;
    if (left + w > innerWidth - pad) left = anchor.x - w - gap;
    if (top + ht > innerHeight - pad) top = innerHeight - ht - pad;
    toast.style.left = `${Math.max(pad, left)}px`;
    toast.style.top = `${Math.max(pad, top)}px`;
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea'); // fallback for http pages / strict permissions policies
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const prev = btn.textContent;
    btn.textContent = 'Copied ✓';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('done'); }, 1200);
  }

  function openPreview(html, label, width) {
    send({ type: 'OPEN_PREVIEW', payload: { html, width, title: `${label} · ${location.hostname}` } });
  }

  const stat = (value, label) => h('span', { class: 'stat' }, h('b', { text: String(value) }), ` ${label}`);

  function renderToast() {
    if (!cap) return;
    const n = selection.length;
    const head = h('div', { class: 'head' },
      h('span', { class: 'chip', text: `<${selection[0].localName}>${n > 1 ? ` +${n - 1}` : ''}` }),
      h('span', { class: 'title', text: cap.error ? 'Too big to capture' : n > 1 ? `${n} elements captured` : 'Element captured' }),
      h('button', { class: 'icon', title: 'Clear selection (Esc)', text: '✕', onclick: clearSelection }));
    const hint = h('div', { class: 'hint', text: 'Ctrl+click elements on the page to add or remove them.' });

    if (cap.error) {
      toast.replaceChildren(head, h('div', { class: 'error', text: cap.error }), hint);
    } else {
      const copyRaw = h('button', { class: 'btn', text: 'Copy' });
      copyRaw.addEventListener('click', () => copy(cap.html, copyRaw));
      const previewRaw = h('button', { class: 'btn', text: 'Preview' });
      const rawCap = cap;
      previewRaw.addEventListener('click', () => openPreview(rawCap.html, 'Raw capture', rawCap.width));

      const output = h('div', { class: 'ai-out' });
      output.hidden = true;
      const genBtn = h('button', { class: 'btn primary', text: '✦ Make clean component' });
      genBtn.addEventListener('click', () => generate(genBtn, output));

      toast.replaceChildren(
        head,
        h('div', { class: 'stats' },
          stat(cap.stats.elements, 'elements'),
          stat(cap.stats.rules, 'CSS rules'),
          stat(cap.stats.hover, 'hover effects'),
          stat(cap.stats.animations, 'animations'),
          stat(cap.stats.kb, 'KB')),
        hint,
        h('div', { class: 'row' },
          h('div', { class: 'row-head' }, h('span', { text: 'Raw HTML + CSS' }), h('span', { class: 'muted', text: 'exact but verbose' })),
          h('div', { class: 'row-body' }, h('code', { class: 'sel', text: cap.markup, title: 'Full HTML + CSS is copied' }), copyRaw, previewRaw)),
        h('div', { class: 'ai' },
          h('div', { class: 'ai-label', text: 'AI clean-up' }),
          genBtn,
          output));
    }
    toast.hidden = false;
    positionToast();
  }

  async function generate(btn, output) {
    const target = cap;
    if (!target?.html) return;
    btn.disabled = true;
    btn.textContent = 'AI is cleaning it up…';
    output.hidden = false;
    output.replaceChildren(h('div', { class: 'skeleton' }));
    positionToast();
    try {
      const res = await send({ type: 'CLEAN_COMPONENT', payload: { raw: target.html, url: location.href } });
      if (!res) throw new Error('Lost connection to the extension. Refresh the page and try again.');
      if (!res.ok) throw new Error(res.error);
      const copyBtn = h('button', { class: 'btn', text: 'Copy code' });
      copyBtn.addEventListener('click', () => copy(res.code, copyBtn));
      const previewBtn = h('button', { class: 'btn', text: 'Preview' });
      previewBtn.addEventListener('click', () => openPreview(res.code, 'Clean component', target.width));
      output.replaceChildren(
        h('div', { class: 'ai-bar' }, h('span', { text: 'component.html' }), h('div', { class: 'btns' }, previewBtn, copyBtn)),
        h('pre', {}, h('code', { text: res.code })));
    } catch (err) {
      output.replaceChildren(h('div', { class: 'error', text: err.message }));
    } finally {
      btn.disabled = false;
      btn.textContent = '✦ Regenerate';
      positionToast();
    }
  }

  /* ───────────────────────── event handlers ───────────────────────── */
  shield.addEventListener('mousemove', (e) => {
    if (!chrome.runtime?.id) return disable(); // extension was reloaded
    lastPoint = { x: e.clientX, y: e.clientY };
    const multi = e.ctrlKey || e.metaKey;
    if (multi !== ctrlDown) ctrlDown = multi;
    const t = elementAt(e.clientX, e.clientY);
    if (t) hovered = t;
    schedule();
  });

  shield.addEventListener('click', (e) => {
    const el = elementAt(e.clientX, e.clientY) || hovered;
    if (!el) return;
    if (e.ctrlKey || e.metaKey) toggleSelect(el, e.clientX, e.clientY);
    else if (locked()) clearSelection(); // plain click on the page = clear the selection
    else selectOnly(el, e.clientX, e.clientY);
  });

  function onScroll() {
    if (lastPoint) {
      const t = elementAt(lastPoint.x, lastPoint.y);
      if (t) hovered = t;
    }
    schedule();
  }

  function onKeyDown(e) {
    if (e.key === 'Control' || e.key === 'Meta') {
      if (!ctrlDown) { ctrlDown = true; schedule(); }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      locked() ? clearSelection() : exitPicker();
      return;
    }
    if (e.composedPath().includes(host) || e.altKey || !hovered || !hoverAllowed()) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const r = hovered.getBoundingClientRect();
      const x = Math.max(0, r.left);
      const y = Math.min(Math.max(0, r.bottom), innerHeight - 20);
      (e.ctrlKey || e.metaKey) ? toggleSelect(hovered, x, y) : selectOnly(hovered, x, y);
      return;
    }
    const next = e.key === 'ArrowUp' ? hovered.parentElement
      : e.key === 'ArrowDown' ? hovered.firstElementChild
      : null;
    if (next && next !== document.documentElement) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hovered = next;
      schedule();
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Control' || e.key === 'Meta') { ctrlDown = false; schedule(); }
  }

  function onBlur() {
    ctrlDown = false;
    schedule();
  }

  function enable() {
    if (active) return;
    active = true;
    document.documentElement.appendChild(host);
    updatePill();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
  }

  function disable() {
    if (!active) return;
    active = false;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('resize', schedule);
    hovered = cap = lastPoint = null;
    selection = [];
    ctrlDown = false;
    toast.hidden = true;
    hoverBox.classList.remove('show');
    selectBoxes.forEach((box) => box.classList.remove('show'));
    defaultsFrame?.remove();
    defaultsFrame = null;
    host.remove();
  }

  function exitPicker() {
    disable();
    send({ type: 'PICKER_EXIT' });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'PICKER_SET') (msg.active ? enable() : disable());
  });
})();
