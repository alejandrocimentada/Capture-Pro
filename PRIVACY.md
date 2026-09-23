# Privacy Policy

_Last updated: September 2026_

Capture Pro is a browser extension that captures the design of elements you select on web pages.

**What it accesses.** Only the tab where you turn the picker on, and only after you activate it from the toolbar or with the keyboard shortcut. It does not run on other sites in the background. It can reach the network only at the AI endpoint you choose in Settings, and only after you grant Chrome's permission for that one address.

**What is stored.** Your provider, endpoint, API key, and model ID are stored locally in your browser (`chrome.storage.local`) and are not synced. Each tab's on/off state and the most recent preview are kept in session storage and cleared when the browser closes.

**What is sent.** Nothing, unless you click ✦ Make clean component. When you do, the captured element's HTML and CSS and the page's URL are sent to the AI endpoint configured in Settings, using your own API key. That provider's privacy policy applies to the request. If you use a local model, the request never leaves your computer.

**What is not collected.** No analytics, no tracking, no accounts, no browsing history. The developer receives no data.

**Contact.** Questions? Open an issue at https://github.com/alejandrocimentada/capture-pro/issues.
