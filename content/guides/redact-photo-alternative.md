---
title: "Redact.photo Alternative: Solid Boxes, Not Blur"
description: Redact.photo blurs images in your browser. RedactPal covers text with solid boxes and finds emails, cards and API keys for you. Free, nothing uploaded.
h1: "Why Blur-Based Redactors Like Redact.photo Aren't Enough"
published: 2026-11-15
updated: 2026-11-16
draft: false
toc: auto
cta:
  tool: redact-screenshot
  title: Cover it with a solid box instead
  text: RedactPal finds emails, card numbers, IBANs and API keys in a screenshot or photo and covers them with opaque boxes. Free, no account, nothing is uploaded.
  button: Redact a screenshot
related:
  - guides/can-blurred-text-be-unblurred
  - redact-screenshot
  - hide-api-keys-in-screenshots
  - guides/best-free-redaction-tools
  - guides/snagit-smart-redact-free-alternative
faq_title: Redact.photo vs RedactPal — questions
faq:
  - q: Does redact.photo upload my image?
    a: Its own page says "All editing happens in your browser. We don't upload any data." RedactPal makes the same promise and backs it with a Content-Security-Policy in its code that blocks connections to other servers, so you can check it in the open-source repository.
  - q: What is the difference between blur and a solid box?
    a: A blur keeps a faint trace of what was underneath. Published research has recovered text from blurred and pixelated images when the font was known. A solid opaque box replaces the pixels, so there is nothing left to recover.
  - q: Does RedactPal work on photos as well as screenshots?
    a: Yes. It reads photos and screenshots with on-device OCR, including dark-mode terminals, and you can also drag a box over anything it does not read, such as a face, a name or a handwritten note.
  - q: Can RedactPal redact a PDF or plain text?
    a: Yes. It handles PDFs up to 200 pages, rebuilt page by page from pixels so hidden text is gone, and it has a text mode that swaps secrets for placeholders such as [EMAIL_1] before you paste into an AI chat.
  - q: Is RedactPal free?
    a: Yes. It is free with no limits, no account and no sign-up, and the code is MIT licensed on GitHub.
---

**Redact.photo is a fast, free way to blur parts of an image in your browser, and it says nothing is uploaded. [RedactPal](/redact-screenshot/) is the better pick for anything sensitive: it covers text with solid boxes instead of blur, finds emails, card numbers, IBANs and API keys for you, and handles PDFs and text as well as images.**

## Why redact.photo is popular

Redact.photo does one job and gets out of the way. Its home page calls it "Free And Private Image Redaction In The Browser" and says "All editing happens in your browser. We don't upload any data." There is one button, **Select Photo**, and the page is marked "100% Free" ([redact.photo](https://redact.photo)). No sign-up, no install, no pricing page.

It also shows its method. A four-step diagram on the page walks through the original image, the image scaled down, pixels shifted randomly and the image blurred. The random shift is a thoughtful touch: a plain blur is predictable, and scrambling the pixels first makes the result harder to work backward from. That openness about how it works, plus a free price tag and a single-purpose page, explains why people find it and share it.

For a face in a holiday photo or a street sign in the background, that is often all you want.

## Where blur falls short

Redact.photo's approach is blur. RedactPal's is a solid box. The difference matters most when the thing you are hiding is text.

A blur or pixelation filter keeps a trace of every letter. [Researchers have recovered blurred and pixelated text](/guides/can-blurred-text-be-unblurred/) from images when the font and size are known, which is easy for a screenshot of a familiar app. An extra random shift is a good idea, but a solid box does not need one. The pixels under it are replaced with a flat color, so there is nothing to recover.

The second gap is finding the data. Redact.photo's page shows a one-image flow built around **Select Photo**, and it describes no automatic detection. If a screenshot holds an API key in the middle of a terminal, you have to spot it yourself. RedactPal reads the image with on-device OCR and highlights it for you.

The third gap is scope. The page is about images. RedactPal puts screenshots, photos, PDFs and plain text in one tool.

## RedactPal vs redact.photo

| | Redact.photo | RedactPal |
| --- | --- | --- |
| Price | "100% Free" | Free, MIT open source |
| Account or sign-up | None described on the page | None |
| Files uploaded | "We don't upload any data" | Nothing uploaded; a Content-Security-Policy blocks other servers |
| How it hides | Scales down, shifts pixels, blurs | Solid opaque boxes only |
| Finds sensitive data for you | Not described on its page | Yes: emails, phone numbers, card numbers (Luhn), IBANs, bank account numbers, US routing numbers, UK sort codes, US SSNs, IP and MAC addresses, passwords, JWTs, private keys, API keys |
| Hide every repeat of a name | Not described | Drag a box once, accept the offer to hide all matches |
| Works on | Images | Screenshots, photos, PDFs (up to 200 pages), text |
| Metadata | Not described on its page | Re-encoded as PNG with no EXIF or GPS |
| Works offline | Not described | Yes, after the first visit; installable as an app |
| Phone | Browser | Browser on iPhone and Android, plus an Android share target |
| Source code | Not published on the page | Open on GitHub |

<!-- cta -->

## How to switch in under a minute

1. Open [redactpal.com](/redact-screenshot/) in any browser. There is nothing to install and no account to make.
2. Drop your photo or screenshot on the page, or paste it with Ctrl+V or ⌘V.
3. Look at the highlighted items. Click one to keep or remove it, and drag a box over anything it missed, such as a face or a name.
4. Export. You get a new PNG with solid boxes and no EXIF or GPS data, ready to share.

Because the work happens in your browser, you can do all of this with your connection switched off once the page has loaded.

## What RedactPal does that a blur tool cannot

**It finds the secret.** The detector checks card numbers with the Luhn test, IBANs with the mod-97 check and US routing numbers with the ABA checksum, so a random long number is not flagged and a real one is. It also knows the prefixes of AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic and Google keys. See [hiding API keys in screenshots](/hide-api-keys-in-screenshots/) for the formats.

**It reads dark mode.** OCR runs on your device (Tesseract), including light text on dark terminals.

**It covers every repeat.** Names and addresses have no fixed format, so RedactPal does not guess. Drag a box over one and it offers to hide every other occurrence.

**It exports a clean file.** Images are re-encoded as PNG without EXIF or GPS data. PDFs are rebuilt from pixels, so hidden text is gone and metadata is not carried over. [Check any redacted PDF yourself](/guides/how-to-check-if-pdf-redaction-worked/) in a minute.

**It keeps secrets out of AI chats.** Text mode swaps secrets for placeholders like `[EMAIL_1]` and restores them in the reply. Try it on [text for ChatGPT](/anonymize-text-for-chatgpt/).

## The verdict

If you only need a quick blur on a picture of a crowd, redact.photo does it for free. For everything else, RedactPal is the recommendation. It is as free and as private, it covers text so it cannot be read back, it finds the sensitive items for you, and it covers screenshots, PDFs and text in one place. Open [RedactPal](/redact-screenshot/), paste your image with Ctrl+V or ⌘V, and check the highlights before you export.

See also the [best free redaction tools in 2026](/guides/best-free-redaction-tools/) and the [Snipping Tool comparison](/guides/snipping-tool-vs-redactpal/).

Redact.photo is a trademark of its owner. RedactPal is not affiliated with Redact.photo.
