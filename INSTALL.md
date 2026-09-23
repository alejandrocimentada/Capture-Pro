# Installing Capture Pro

This takes about 3 minutes. Capture Pro isn't on the Chrome Web Store yet, so you'll install it with Chrome's **Developer mode**, a built-in feature made for exactly this.

**Requirements:** Google Chrome, Microsoft Edge, or Brave, version 116 or newer.

## 1. Download

1. Go to the [latest release](https://github.com/alejandrocimentada/capture-pro/releases/latest).
2. Under **Assets**, click **capture-pro.zip**.

## 2. Unzip it somewhere permanent

- **Windows:** right-click the ZIP → **Extract All…** → choose a folder such as `Documents\Extensions\capture-pro`.
- **Mac:** double-click the ZIP, then move the folder to somewhere like `Documents/Extensions`.

> ⚠️ Chrome loads the extension from this folder every time it starts. If you delete or move the folder, the extension stops working.

Make sure `manifest.json` is directly inside the folder, not inside another folder.

## 3. Turn on Developer mode

1. Open a new tab and go to `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode**: top-right corner in Chrome and Brave, left sidebar in Edge.

## 4. Load the extension

1. Click **Load unpacked**.
2. Select the folder from step 2, the one that contains `manifest.json`, and click **Select Folder**.
3. **Capture Pro** appears in the list with its orange logo.

## 5. Pin it and check the shortcut

1. Click the puzzle-piece icon in the toolbar and pin **Capture Pro**.
2. Click its icon to open the popup. If the shortcut says **Set shortcut**, click it and assign one (`Alt+Shift+S` is recommended). Another extension may already be using that combination.

## 6. Try it

1. Open any regular website and **refresh** the page.
2. Press `Alt+Shift+S`. An orange outline follows your mouse.
3. Click an element. A card shows what was captured.
4. Click **Preview** to see it on its own, or **Copy** to copy the raw HTML + CSS.

## 7. Optional: enable ✦ Make clean component

The AI clean-up uses your own API key from any provider you like, so you only pay for what you use (typically a few cents per component, or nothing with a local model).

1. Get an API key from a provider. Built-in presets: **Anthropic** (Claude), **OpenAI**, **OpenRouter** (hundreds of models behind one key), and **ZenMux**.
2. Right-click the Capture Pro icon → **Options**.
3. Choose your **Provider**, paste your **API key**, and enter a **Model ID** exactly as your provider lists it (the Anthropic preset suggests one).
4. Click **Save settings**, then **Allow** when Chrome asks for access to the provider's API. The extension can only reach that one address.

**Other providers or local models:** choose **Custom**, enter the full endpoint URL, and pick the API format:

| Provider | Endpoint | Format |
|---|---|---|
| Most hosted APIs (Groq, Together, Mistral, DeepSeek, …) | the provider's `…/v1/chat/completions` URL | OpenAI |
| Ollama (local) | `http://localhost:11434/v1/chat/completions` | OpenAI |
| LM Studio (local) | `http://localhost:1234/v1/chat/completions` | OpenAI |
| Anthropic-compatible gateways | the gateway's `…/v1/messages` URL | Anthropic |

Local servers usually don't need a key, so you can leave it empty with **Custom**. Your key is stored only in this browser and is never synced.

## Updating

1. Download the new ZIP from the latest release.
2. Replace the files in your extension folder with the new ones.
3. On `chrome://extensions`, click the reload arrow ⟳ on Capture Pro, then refresh any open tabs.

Your settings and API key are kept, as long as you use the same folder.

## Uninstalling

On `chrome://extensions`, click **Remove** on Capture Pro, then delete its folder.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Manifest file is missing or unreadable" | You selected the wrong folder. Choose the one that directly contains `manifest.json`. |
| The shortcut does nothing | Open `chrome://extensions/shortcuts`, assign a shortcut to Capture Pro, then refresh the page. |
| The popup says "Not available here" | Chrome doesn't allow extensions on `chrome://` pages or the Web Store. Try a regular website. |
| "Lost connection to the extension", or nothing happens after an update | Refresh the web page. Tabs opened before an update still run the old version. |
| "No API key yet" or "No model ID yet" | Fill them in on the Options page (step 7). |
| "Capture Pro needs permission to reach …" | Open Options, click **Save settings**, and click **Allow** in Chrome's prompt. |
| "Model not found" or another API error | Check that the model ID matches your provider's list exactly, and that the API format matches the endpoint. |
| Chrome reminds you about developer-mode extensions | That's normal for extensions installed outside the Web Store. You can dismiss it. |
| A capture looks different in the preview | Some styles come from stylesheets that browsers don't let extensions read. See *Limitations* in the README. |

Still stuck? [Open an issue](https://github.com/alejandrocimentada/capture-pro/issues) with a screenshot.

## For maintainers: publishing a release

1. Zip the **contents** of `extension/` (not the folder itself) as `capture-pro.zip`, so `manifest.json` is at the top level of the ZIP.
2. On GitHub: **Releases** → **Draft a new release**, tag it with the version from `manifest.json` (e.g. `v2.2.0`), attach the ZIP, and publish.
3. The website's download button always points to `releases/latest/download/capture-pro.zip`, so it updates automatically.
