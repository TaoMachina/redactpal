---
title: RedactPal — Redact Screenshots & PDFs Free, No Upload
description: Black out emails, phone numbers, card numbers and API keys in screenshots, PDFs and text. Free, open source, and it runs in your browser.
h1: Hide sensitive info before you share.
intro: Redact screenshots, PDFs and text. Everything stays in your browser — nothing is uploaded.
nav_label: Redaction tool
nav_order: 0
published: 2026-11-15
updated: 2026-11-16
related:
  - guides/can-blurred-text-be-unblurred
  - redact-pdf
  - guides/how-to-check-a-redaction-tool-doesnt-upload-your-file
  - guides/best-free-redaction-tools
faq_title: Redact screenshots, PDFs and text — questions
faq:
  - q: How do I redact a screenshot?
    a: Open redactpal.com and paste the screenshot (Ctrl+V or ⌘V), drop it on the page, or tap “Choose a photo or PDF” on a phone. Emails, phone numbers, card numbers, API keys and other sensitive text are found and highlighted. Tap a highlight to keep it visible, drag over anything that was missed, then copy, share or save the image. The result has solid black boxes.
  - q: How do I redact a PDF for free?
    a: Drop the PDF on redactpal.com, check the highlighted items on every page, and download the redacted PDF. Each page is rebuilt from pixels, so text under a box can’t be copied out, and metadata such as author and title is removed. It’s free and needs no account.
  - q: Is my file uploaded anywhere?
    a: No. RedactPal runs entirely in your browser — text recognition and detection happen on your device, and the page is blocked from connecting to other servers. After the first visit it even works offline. The code is open source, so anyone can check.
  - q: Why not just blur or pixelate sensitive info?
    a: Blurred and pixelated text can often be reconstructed. RedactPal only uses solid, opaque boxes, and re-encodes the image so nothing of the original survives under them.
  - q: What does RedactPal detect automatically?
    a: "Email addresses, phone numbers, credit card numbers, IBANs, bank account and routing numbers, US Social Security numbers, IP addresses, passwords, JWTs and API keys from AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, Google and more. Names and addresses have no fixed format: draw a box over one once and RedactPal offers to hide it everywhere it appears."
  - q: Can I redact text before pasting it into ChatGPT or another AI?
    a: Yes. Paste the text and copy the safe version — sensitive values become placeholders like [EMAIL_1]. When the AI replies, paste the reply back and RedactPal puts your real details back in.
  - q: Does it work on iPhone and Android?
    a: Yes. Open redactpal.com in any mobile browser, pick a photo or PDF, and share the result. You can add it to your home screen, and on Android you can share a photo straight to RedactPal.
  - q: Can my company use or self-host RedactPal?
    a: Yes. RedactPal is MIT-licensed and is just static files, so it can be hosted on an internal server with no backend. Files never leave the device.
---

## What RedactPal does

RedactPal hides sensitive information in screenshots, photos, PDFs and text before you share them. Paste or drop a file and it reads the text on your device — with OCR for images and scanned pages — highlights what looks sensitive, and covers it with solid black boxes. You check every box, drag to add your own, then copy, share or download the safe version. Nothing is uploaded: the page is blocked from talking to any other server, and it keeps working offline. RedactPal is free with no limits, no account, no ads and no tracking, and it is open source (MIT). It is a public-good project, not a trial for a paid plan.

![RedactPal highlighting an AWS key, a Stripe key, an IP address, an email, a card number and a phone number in a chat screenshot, all fake sample data](img/redactpal-detects-secrets.png "RedactPal reviewing a chat screenshot with fake data: six secrets are highlighted before anything is covered (as of November 2026).")

## What it finds

Email addresses, phone numbers, credit card numbers (Luhn-checked), IBANs, labelled bank account numbers, US routing numbers and UK sort codes, US Social Security numbers, IP and MAC addresses, passwords and secrets in config files and logs, JWTs, and API keys from services such as AWS, GitHub, Stripe, Slack and OpenAI. Detection is rule-based: known formats, checksums and key prefixes.

## Names and anything else, in one drag

Drag a box over a name, an address or a project codename once, and RedactPal finds every other place it appears and offers to hide them all. You see every box before anything is shared, so you stay in control of exactly what leaves your device.

## Why solid boxes, not blur

Blurred or pixelated text can sometimes be [reconstructed](/guides/can-blurred-text-be-unblurred/). RedactPal only uses opaque boxes and rebuilds the export from pixels: images are re-encoded without location data, and PDF pages become images, so text under a box can’t be copied out.

## Check it yourself: nothing is uploaded

You don't have to take our word for it. The test takes a minute.

1. Open your browser's DevTools (F12, or Ctrl+Shift+J / ⌘⌥J in Chrome) and click the **Network** tab. Clear the list.
2. Drop a file on this page and redact it. No request carries your file. The list shows only GET requests for RedactPal's own app files, such as code that loads on demand and the text-recognition engine for scans. Nothing is sent out.
3. Switch on airplane mode and redact another one. It still works, because everything runs on your device.
4. The browser enforces it: the site's [Content-Security-Policy](https://github.com/TaoMachina/redactpal/blob/main/public/_headers) sets `connect-src 'self' blob: data:`, so it can't connect to other servers. The [full test, for any redaction tool](/guides/how-to-check-a-redaction-tool-doesnt-upload-your-file/) shows what to look for.
