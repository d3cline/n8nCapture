# n8n Web Clip – Browser Extension

Lightweight browser extension that sends selected text (plus page metadata) into your n8n workflows via HTTP POST.

Use it to capture snippets from forums, docs, tickets, social media, whatever — and feed them into n8n for storage, enrichment, AI processing, outreach, or anything else your workflows handle.

---

## Features

- **Right-click → Send to n8n**  
  Select any text on a page, right-click, choose a target, and the extension POSTs it to your n8n webhook.

- **Multiple targets / endpoints**  
  Define multiple targets (e.g. `Leads`, `Research`, `Support Snippets`). Each target gets:
  - Its own context-menu entry
  - Its own n8n webhook URL

- **Page context included**  
  Sends:
  - Selected text  
  - Page URL  
  - Page title  
  - Domain  
  - Target key (the configured “slug”)  
  - Timestamp  
  - User agent

- **n8n-friendly JSON payload**  
  Clean JSON designed to plug straight into `Webhook → DataTable / DB / Workflow`.

- **Optional shared-secret header**  
  Optional static token, sent in a custom header for simple auth on your n8n webhook.

---

## How it works

When you select text and choose a menu item like:

> **n8n Web Clip → Leads**

the extension:

1. Reads the selected text and page metadata.
2. Looks up the chosen target in your saved configuration.
3. Sends a `POST` request to that target’s n8n webhook URL.

Example payload:

```json
{
  "text": "This platform is great but I wish it had a simpler automation setup.",
  "url": "https://example.com/some-thread",
  "title": "Random discussion about tooling",
  "domain": "example.com",
  "target": "leads",
  "createdAt": "2025-12-09T07:00:00.000Z",
  "userAgent": "Mozilla/5.0 ...",
  "extra": {}
}
````

If you configure a token, the extension also sends e.g.:

```http
x-n8n-webclip-token: YOUR_SHARED_SECRET
```

(Header name is configurable in the code if you want to change it.)

---

## Requirements

* A running **n8n** instance reachable via HTTPS.
* At least one **Webhook** workflow in n8n to receive the data.
* A modern browser that supports WebExtensions:

  * Chromium-based (Chrome, Brave, Edge, etc.)
  * Firefox (with minor manifest tweaks if needed)

---

## Installation

### 1. Clone this repository

```bash
git clone https://github.com/<your-org>/<your-repo>.git
cd <your-repo>
```

Assuming the extension lives in `extension/` (update if different).

### 2. Load in Chrome / Chromium

1. Go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.

### 3. Load in Firefox (temporary)

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Pick `manifest.json` from the `extension/` folder.

For a permanent Firefox install you’ll need to package and sign the extension.

---

## Configuration

### Open the options page

* Chrome: `chrome://extensions` → **n8n Web Clip** → **Details** → **Extension options**
* Or right-click the extension icon (if pinned) → **Options**.

### Targets

You can define one or more “targets”. Each target becomes a separate entry in the context menu.

Each target has:

* **Label** – Human-readable name (shown in the context menu).
  Example: `Leads (Reddit)`

* **Slug / key** – Short identifier sent as `target` in the payload.
  Example: `leads_reddit`

* **Webhook URL** – The n8n webhook endpoint URL.
  Example: `https://n8n.example.com/webhook/leads-reddit-12345`

* **Token (optional)** – Static token included in the auth header.
  Example: `super-secret-token-123`

* **Header name (optional)** – If you want a custom header name.
  Default in code: `x-n8n-webclip-token`.

The extension stores this configuration locally in the browser (no remote storage).

---

## Example n8n workflow

Basic pattern:

1. **Webhook (Trigger)**

   * Method: `POST`
   * Path: e.g. `/webhook/leads-reddit-12345`
   * Optional: Check `x-n8n-webclip-token` header against an environment variable.

2. **IF / Switch (optional)**

   * Branch on `target` if multiple clip targets feed into the same webhook.

3. **DataTable / DB node**

   * Insert `text`, `url`, `title`, `domain`, `target`, `createdAt`, etc.

4. **Downstream processing**

   * AI summarization / categorization
   * Enrichment
   * Email / Slack notifications
   * Anything else n8n can do

Payload fields you’ll typically use:

* `{{$json["text"]}}`
* `{{$json["url"]}}`
* `{{$json["title"]}}`
* `{{$json["domain"]}}`
* `{{$json["target"]}}`
* `{{$json["createdAt"]}}`

---

## Privacy & Security

* All data is sent **only** to the webhook URLs you configure.
* Configuration is stored locally in the browser (extension storage).
* Use HTTPS on your n8n instance.
* Use a token + header (and validate it in the workflow) if you’re exposing the webhook publicly.

---

## Development

* The extension is plain WebExtension + JS, no build step required.
* Edit files under `extension/`, then reload the extension from your browser’s extension page.
* If you change permissions or the manifest, you may need to remove and re-add the extension.

---

## License

GNU General Public License v3.0

