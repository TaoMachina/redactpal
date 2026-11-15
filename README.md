# Blot

**Hide sensitive info before you share.** Paste a screenshot, drop a PDF, or paste text — Blot finds emails, phone numbers, card numbers, API keys, passwords and more, and covers them with solid boxes. You check, then copy or share the safe version.

Everything runs on your device. Nothing is uploaded. Turn off Wi-Fi and it still works.

## How to use

1. Take a screenshot (or pick an image / PDF).
2. Open Blot and press **Ctrl+V / ⌘V** (or drop the file, or tap *Choose*).
3. Sensitive spots are highlighted. Tap a highlight to keep it visible; drag to hide anything that was missed.
4. Press **Copy** (or **Share** on a phone / **Download** for PDFs). The exported file has solid black boxes.

Text works too: paste text to get a redacted copy, or a *placeholder* version to send to an AI chat — then paste the AI's reply back to restore your real values.

## Why you can trust it

- **No uploads, no tracking, no third-party requests.** All code and the OCR engine are served from the same origin; a strict Content-Security-Policy blocks connections elsewhere.
- **Solid boxes only.** Blur and pixelation can be reversed; Blot never uses them.
- **Rebuilt from pixels.** Exported images are re-encoded (no EXIF/GPS). Exported PDFs are rebuilt page-by-page as images, so text under a box cannot be copied out, and metadata (author, title, …) is dropped. Trade-off: text in the exported PDF is not selectable.
- **Detection can miss things.** It is rule-based (formats, checksums, known key prefixes) — always look before you share. Add names or words you always want hidden under *Always hide*.

## Self-hosting (companies)

Blot is a static site with no backend.

```bash
npm install
npm run build      # outputs dist/
```

Copy `dist/` to any static web server (internal intranet, S3, nginx, GitHub Pages…). That's it.

For the strongest guarantee, also send the Content-Security-Policy as an HTTP header — a `<meta>` CSP (already in the page) does not cover the OCR/PDF web workers. `public/_headers` (Netlify, Cloudflare Pages) and `vercel.json` do this for you; for nginx:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
add_header Referrer-Policy no-referrer always;
```

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module layout and design principles.

## License

MIT — free for personal and commercial use.
