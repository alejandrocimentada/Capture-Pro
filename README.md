<p align="center">
  <img src="docs/logo.svg" width="72" alt="Capture Pro logo">
</p>

<h1 align="center">Capture Pro</h1>

<p align="center">
  Copy any design on the web as clean, reusable HTML + CSS.<br>
  A Chrome extension that captures elements from any website and uses AI to turn them into tidy components.
</p>

<p align="center">
  <a href="https://github.com/alejandrocimentada/capture-pro/releases/latest"><b>Download</b></a> ·
  <a href="INSTALL.md">Install guide</a> ·
  <a href="https://alejandrocimentada.github.io/capture-pro/">Website</a>
</p>

<!-- Record a 10–15 s demo (e.g. with ScreenToGif): picker on, capture a card, ✦ Make clean component, Preview.
     Save it as docs/images/demo.gif, then uncomment:
<p align="center">
  <img src="docs/images/demo.gif" width="720" alt="Capturing a card and turning it into a clean component">
</p>
-->

## Features

- **Point-and-click capture.** Hover to highlight, click to capture an element and everything inside it. `↑` / `↓` move to the parent or child.
- **Multi-select.** Hold `Ctrl` (`Cmd` on Mac) and click to combine several elements into one component.
- **Complete styles.** Layout, colors, fonts, borders, shadows, `:hover` rules, `::before` / `::after`, and CSS animations with their `@keyframes`.
- **✦ Clean component with AI.** Turns the raw capture into readable HTML + CSS with meaningful class names, CSS variables, and scoped selectors. Bring your own API key: Anthropic (Claude), OpenAI, OpenRouter, ZenMux, or any OpenAI- or Anthropic-compatible endpoint, including local models.
- **Live preview.** See the result next to its full, syntax-highlighted code, then copy it in one click.
- **Stays out of the way.** The UI lives in a Shadow DOM, so it never clashes with the page, and page clicks are blocked while you pick.

## Install

Capture Pro isn't on the Chrome Web Store yet, so install it in developer mode:

1. Download `capture-pro.zip` from the [latest release](https://github.com/alejandrocimentada/capture-pro/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
4. Pin the extension and press `Alt+Shift+S` on any website.

Full walkthrough, API key setup, and troubleshooting: **[INSTALL.md](INSTALL.md)**

## Usage

| Action | How |
|---|---|
| Turn the picker on / off | `Alt+Shift+S` or the toolbar switch |
| Capture an element | Click it |
| Select the parent / child | `↑` / `↓`, then `Enter` |
| Add or remove elements | `Ctrl` + click (`Cmd` + click on Mac) |
| Clear the selection | Click the page or press `Esc` |
| Exit the picker | `Esc` with nothing selected |

After capturing, you can **Copy** or **Preview** the raw HTML + CSS right away (no API key needed), or click **✦ Make clean component** to have an AI model rewrite it.

## How it works

**Capture.** For every element in the selection, the content script reads about 100 computed style properties and keeps only the values that differ from the browser's defaults (measured in a blank, hidden iframe) or, for inherited properties, from the parent. Margins, padding, borders, and radii are compressed into shorthands. `:hover` rules and `@keyframes` are read from the page's same-origin stylesheets, and image and link URLs are made absolute.

**Clean-up.** The raw capture is sent to the AI model you configured, with a prompt that asks for one self-contained HTML + CSS component: BEM class names under a single scoped root class, CSS variables for repeated values, flexible layout instead of fixed pixel sizes, and preserved hover effects and animations (wrapped in `prefers-reduced-motion`). No JavaScript.

**Any provider.** `providers.js` holds presets for common APIs. The background worker speaks both the Anthropic Messages format and the OpenAI Chat Completions format, which together cover most hosted and local models. Chrome only lets the extension reach the endpoint you choose: host access is requested at runtime for that one origin.

**Isolation.** While you pick, a transparent shield covers the page, so the page never receives your clicks and its own hover styles don't leak into the capture. All UI renders inside a closed Shadow DOM.

### Architecture

| File | Role |
|---|---|
| `manifest.json` | Manifest V3: `activeTab` + `scripting` (no broad site access), `storage`, optional host access for the AI endpoint |
| `background.js` | Service worker: per-tab state, toolbar icon, preview tabs, AI API calls |
| `providers.js` | Provider presets and endpoint helpers, shared with the Options page |
| `content.js` | Injected on demand: picker overlay, style capture engine, result card |
| `preview.html` / `.js` | Sandboxed live preview with a syntax-highlighted code panel |
| `popup.html` / `.css` / `.js` | Toolbar popup: on/off switch, status, shortcut |
| `options.html` / `.js` | Provider, endpoint, API key, and model settings |

Vanilla JavaScript: no frameworks, no build step, no dependencies.

## Privacy

Nothing leaves your browser unless you click **✦ Make clean component**. Then only the captured element's HTML and CSS and the page URL are sent to the AI endpoint you configured. Your API key is stored locally in `chrome.storage.local` and never synced. See [PRIVACY.md](PRIVACY.md).

## Limitations

- `:hover` rules and `@keyframes` from cross-origin stylesheets (e.g. CDNs) can't be read by extensions.
- Descendant hover rules like `.card:hover .title` aren't captured yet.
- JavaScript-driven animations (GSAP, scroll-triggered effects) are captured as a static snapshot.
- Web fonts are referenced by name; the clean component adds a Google Fonts import when it recognizes one.
- Output quality depends on the model you choose.
- Chrome blocks all extensions on `chrome://` pages and the Chrome Web Store.

## Responsible use

Capture Pro is for learning from and adapting designs. Please respect the people who made them: don't clone other sites' branding, logos, or images.

## Roadmap

- [ ] *Download .html* and separate *Copy CSS* / *Copy HTML* buttons
- [ ] Descendant hover rules (`.parent:hover .child`)
- [ ] Streaming responses so long clean-ups show progress
- [ ] Chrome Web Store release

## Project structure

```
capture-pro/
├── extension/   ← the Chrome extension (load this folder)
├── docs/        ← the website (GitHub Pages) and README images
├── tools/       ← icon generator
├── INSTALL.md
├── PRIVACY.md
└── README.md
```

## About

Built by **Alejandro Cimentada** as part of an applied-AI portfolio: a practical tool that pairs a hand-written capture engine with an LLM step where it adds real value.
[Portfolio](https://YOUR-PORTFOLIO-URL) · [LinkedIn](https://YOUR-LINKEDIN-URL)

Licensed under the [MIT License](LICENSE).
