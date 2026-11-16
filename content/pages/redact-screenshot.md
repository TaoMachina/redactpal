---
title: Redact a Screenshot Free – Auto-Detects Keys & Cards
description: Paste a screenshot and RedactPal boxes emails, phone numbers, card numbers and API keys automatically. Free, open source, nothing is uploaded.
h1: "Redact a screenshot in seconds: free, private, nothing uploaded"
intro: "Paste a screenshot (Ctrl+V / ⌘V). Emails, phone numbers, card numbers and API keys are boxed for you; drag over anything else. Free, open source (MIT), no account."
accept: image
nav_label: Redact a screenshot
nav_order: 20
published: 2026-11-15
updated: 2026-11-16
draft: false
related:
  - hide-api-keys-in-screenshots
  - guides/can-blurred-text-be-unblurred
  - guides/snipping-tool-quick-redact-limits
  - guides/iphone-markup-redaction-safe
  - guides/snagit-smart-redact-free-alternative
  - guides/how-to-check-a-redaction-tool-doesnt-upload-your-file
faq_title: Redacting screenshots — questions
faq:
  - q: Can someone remove the black box?
    a: No. The boxes are painted into the pixels and the image is re-encoded as a new PNG, so the original pixels under a box are not in the file. There is no layer to delete and nothing to unblur.
  - q: Is blurring a screenshot safe?
    a: "Not for text. Researchers concluded that [mosaicing and blurring are not viable approaches for text redaction](https://petsymposium.org/popets/2016/popets-2016-0047.php), and a [2022 Bishop Fox write-up](https://bishopfox.com/blog/unredacter-tool-never-pixelation) recovered pixelated text and recommends black bars. RedactPal only draws solid boxes."
  - q: Does it work offline?
    a: Yes. After your first visit the page and its text-recognition engine are cached, so it keeps working with Wi-Fi off. You can also install it as an app from your browser.
  - q: Can I redact several screenshots in a row?
    a: Yes. When you finish one image, drop or paste the next. Each one is processed on your device.
  - q: Does it work for screenshots of chats such as WhatsApp or Slack?
    a: Yes. Phone numbers, emails and links with tokens are found in any screenshot. Contact names and message text have no fixed format, so drag a box over a name once and RedactPal offers to hide it everywhere it appears.
  - q: Is it really free?
    a: Yes. RedactPal is MIT-licensed, and needs no account. The [source code is on GitHub](https://github.com/TaoMachina/redactpal).
---

## How to redact a screenshot

1. **Paste or drop the screenshot.** Press Ctrl+V / ⌘V on this page, drop the file, or tap **Choose a photo or PDF** on a phone.
2. **Check the highlights.** Sensitive text is boxed. Tap a highlight to keep it visible.
3. **Drag over anything else**, such as a name, a face or an address.
4. **Copy, share or save.** The result has solid black boxes and is a fresh PNG.

![A fake chat screenshot containing an AWS key, a Stripe key, an IP address, an email, a card number and a phone number, before redaction](img/redactpal-screenshot-with-secrets.png "Before: a fake chat screenshot (sample data only) with six secrets in plain sight.")

![The same screenshot after RedactPal's preview: every secret is covered by a solid black box](img/redactpal-solid-boxes-preview.png "After: the same screenshot in RedactPal's preview. Each secret is a solid black box, not a blur.")

## What does RedactPal hide automatically?

Detection is rule-based: known formats, checksums and key prefixes. It reads the text on your device with OCR, then matches it against these rules ([the full list is in `src/detect/rules.ts`](https://github.com/TaoMachina/redactpal/blob/main/src/detect/rules.ts)).

| Type | What it matches |
|---|---|
| Email addresses | Including OCR-spaced forms like `jane . doe @ example . com` |
| Phone numbers | International (`+CC …`) and common US, UK, DE, FR, IN, CN and JP formats |
| Card numbers | 13–19 digits with a known network prefix and a valid Luhn checksum |
| IBANs | Country length and mod-97 checksum |
| US Social Security numbers | `AAA-GG-SSSS`, plus 9-digit forms after an "SSN" label |
| IP and MAC addresses | IPv4, IPv6 and MAC formats |
| Passwords and secrets | Values after `password=`, `secret:`, `token=`, `--password` and similar |
| Tokens and headers | JWTs, `Authorization: Bearer …`, private key blocks, URLs with `user:pass@` or `?token=` |
| Provider keys | AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, Google, SendGrid, npm, Hugging Face, Twilio, Discord |

Developers: see [how to hide API keys in screenshots](/hide-api-keys-in-screenshots/) for the key formats in detail.

### Names and addresses: drag once, hide everywhere

Names and street addresses have no fixed format. Drag a box over a name once and RedactPal offers to hide it everywhere it appears in that image.

## Why solid boxes and not blur?

Blurred and pixelated text can be reconstructed. Hill, Zhou, Saul and Shacham (PoPETs 2016) concluded that ["mosaicing and blurring ... are not viable approaches for text redaction"](https://petsymposium.org/popets/2016/popets-2016-0047.php). In 2022 Dan Petro at Bishop Fox [recovered pixelated text with a tool](https://bishopfox.com/blog/unredacter-tool-never-pixelation) and wrote that the only secure way is black bars. RedactPal never blurs. Details in our guide: [can blurred text be unblurred?](/guides/can-blurred-text-be-unblurred/)

## Is my screenshot uploaded?

No. Text recognition (Tesseract) runs in your browser. The page ships with a Content-Security-Policy that blocks connections to other servers, and the code is open for anyone to check; see "Why you can trust it" in the [README](https://github.com/TaoMachina/redactpal#why-you-can-trust-it).

## What is left in the file after redaction?

The export is re-encoded from pixels as a PNG. It carries no EXIF or GPS data from the original, and nothing from the pixels under a box. This matters: in March 2023 the Windows 11 Snipping Tool was found to [leave cropped data in a file when saved over the original](https://www.bleepingcomputer.com/news/microsoft/windows-11-snipping-tool-privacy-bug-exposes-cropped-image-content/) (BleepingComputer, 21 March 2023). RedactPal writes a new image instead of editing the old one. See also [what the Snipping Tool's quick redact leaves behind](/guides/snipping-tool-quick-redact-limits/).

## What to check before you send any screenshot

- Browser tabs, bookmarks and the profile picture or email in the corner.
- Notification banners.
- Tokens in the URL bar.
- The clock, signal indicator and app buttons. The Freedom of the Press Foundation [advises cropping these out](https://freedom.press/training/redacting-photos-on-the-go/).
- QR codes, which can hold a link or login.
- Anything RedactPal highlighted that you want visible, and anything it missed. Detection covers formats; you add the rest with one drag.

## Redact screenshots on phone, Windows or Mac

RedactPal runs in any modern browser, so the steps are the same on every device. On a phone, open redactpal.com, tap **Choose a photo or PDF**, then **Share** the result. If you use built-in tools instead, read how safe they are: [Snipping Tool quick redact](/guides/snipping-tool-quick-redact-limits/) and [iPhone Markup](/guides/iphone-markup-redaction-safe/).

Need a PDF instead? Use [Redact a PDF](/redact-pdf/).

## Check it yourself: nothing is uploaded

You don't have to take our word for it. The test takes a minute.

1. Open your browser's DevTools (F12, or Ctrl+Shift+J / ⌘⌥J in Chrome) and click the **Network** tab. Clear the list.
2. Paste a screenshot on this page and redact it. No request carries your image. The list shows only GET requests for RedactPal's own app files, such as code that loads on demand and the text-recognition engine for scans. Nothing is sent out.
3. Switch on airplane mode and redact another one. It still works, because everything runs on your device.
4. The browser enforces it: the site's [Content-Security-Policy](https://github.com/TaoMachina/redactpal/blob/main/public/_headers) sets `connect-src 'self' blob: data:`, so it can't connect to other servers. The [full test, for any redaction tool](/guides/how-to-check-a-redaction-tool-doesnt-upload-your-file/) shows what to look for.
