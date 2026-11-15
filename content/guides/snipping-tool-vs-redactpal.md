---
title: "Snipping Tool vs RedactPal: Quick Redact Compared"
description: Snipping Tool's Quick redact hides emails and phone numbers. RedactPal also finds card numbers, IBANs and API keys. Free, nothing uploaded.
h1: "Snipping Tool Finds Your Email. RedactPal Finds Your API Key Too."
published: 2026-11-15
updated: 2026-11-15
draft: false
toc: auto
cta:
  tool: redact-screenshot
  title: Cover everything in one pass
  text: RedactPal finds emails, phone numbers, card numbers, IBANs and API keys in a screenshot and covers them with solid boxes. Free, no account, nothing is uploaded.
  button: Redact a screenshot
related:
  - guides/snipping-tool-quick-redact-limits
  - redact-screenshot
  - hide-api-keys-in-screenshots
  - guides/best-free-redaction-tools
faq_title: Snipping Tool vs RedactPal — questions
faq:
  - q: Is Snipping Tool's text recognition local?
    a: Yes. Microsoft's support page says "All text recognition processes are performed locally on your device." RedactPal's OCR also runs on your device, and its Content-Security-Policy blocks connections to other servers.
  - q: What does Quick redact cover?
    a: Microsoft describes it as hiding email addresses and phone numbers in a snip. RedactPal covers those too, plus card numbers, IBANs, bank account numbers, US SSNs, IP and MAC addresses, passwords, JWTs, private keys and API keys.
  - q: Can RedactPal hide a name?
    a: Yes. Names have no fixed format, so you drag a box over one occurrence and RedactPal offers to hide every other occurrence in the file.
  - q: Do I need Windows 11 to use RedactPal?
    a: No. RedactPal runs in any modern browser on Windows, Mac, Linux, iPhone and Android, works offline after the first visit and can be installed as an app.
  - q: Was the acropalypse bug in Snipping Tool fixed?
    a: Yes. Microsoft tracks it as CVE-2023-28303 and fixed it in Snipping Tool 11.2302.20.0. See the [Quick redact guide](/guides/snipping-tool-quick-redact-limits/) for the details and the save-as-new-file habit.
---

**Snipping Tool's Quick redact covers email addresses and phone numbers, per Microsoft. RedactPal covers those and also card numbers, IBANs, bank account numbers and API keys, with solid boxes, for screenshots, PDFs and text. It is free, needs no account and runs in your browser, so nothing is uploaded. For anything sensitive, RedactPal is the recommendation.**

## Why Snipping Tool is so popular

Snipping Tool is the screenshot tool on your Windows 11 PC. You press a shortcut and you have a snip. Microsoft's page lists a delay of 1 to 5 seconds, video snips, and a Record shortcut (Windows logo key + Shift + R). Click **Text actions** and the app runs optical character recognition on the snip, and per Microsoft "all text recognition processes are performed locally on your device" ([Microsoft Support](https://support.microsoft.com/en-us/windows/use-snipping-tool-to-capture-screenshots-00246869-1843-655f-f220-97299b865f6b)).

From there you can copy all the text or use **Quick redact** on "any email addresses or phone numbers in the snip." One click, no extra app, no browser tab. For the most common case, hiding a stray email in a screenshot, it is hard to beat for convenience. It deserves its popularity.

## Where RedactPal goes further

Quick redact is built around two kinds of data. Screenshots hold more than that. A developer's terminal shows keys. A banking page shows an IBAN or a card number. A settings page shows a password field. RedactPal's detector is built for those.

Paste the screenshot with Ctrl+V or ⌘V and RedactPal highlights what it finds:

- emails and phone numbers;
- credit card numbers, checked with the Luhn test;
- IBANs, checked with the mod-97 test;
- bank account numbers after a label, US routing numbers (ABA checksum) and UK sort codes;
- US Social Security numbers, IP and MAC addresses;
- passwords and secrets in config files, JWTs and private keys;
- API keys for AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, Google and more.

The checksum tests matter. A 16-digit order number is not flagged as a card, and a real card is. The screenshot is read with on-device OCR (Tesseract), including dark-mode terminals.

For anything without a fixed format, such as a name, drag a box once. RedactPal offers to hide every other occurrence, so you do not hunt for the second and third mention.

## Snipping Tool vs RedactPal at a glance

| | Snipping Tool (Quick redact) | RedactPal |
| --- | --- | --- |
| Price | Part of Windows 11 | Free, MIT open source |
| Account | None needed | None needed |
| Where it runs | Windows app | Any modern browser; installable app; works offline after the first visit |
| Platforms | Windows 11 (as documented by Microsoft) | Windows, Mac, Linux, iPhone, Android; Android share target |
| Uploaded | Text recognition is local, per Microsoft | Nothing is uploaded; a Content-Security-Policy blocks other servers |
| Detects automatically | Email addresses and phone numbers | Emails, phones, cards, IBANs, bank accounts, routing numbers, SSNs, IP and MAC addresses, passwords, JWTs, private keys, API keys |
| Names and other text | Select text by hand | Drag once, hide every repeat |
| Files it handles | Screenshots | Screenshots, photos, PDFs (up to 200 pages), text |
| Export | Save the snip as a new file | Re-encoded PNG without EXIF or GPS; PDFs rebuilt from pixels |
| Source code | Microsoft app | Open on GitHub (MIT) |

<!-- cta -->

## Using both: snip in Windows, redact in RedactPal

You do not have to give up Snipping Tool. Take your snip as usual, copy it, then open RedactPal and press Ctrl+V. The highlights appear in a few seconds. Check them, drag over any name or detail it did not flag, and export the PNG. The result is a new image with solid boxes and no EXIF data, so you never save over your original snip. Because nothing is uploaded, a screenshot of a private dashboard stays on your machine the whole time.

## Beyond screenshots

Snipping Tool captures the screen. RedactPal also opens a [PDF of up to 200 pages](/redact-pdf/) and rebuilds each page from pixels, so hidden text under a box is gone, and metadata is not carried over. For [a bank statement](/redact-bank-statement/), that means account numbers and IBANs get found and covered across every page. Text mode swaps secrets for placeholders such as `[EMAIL_1]` before you paste into an AI chat, and restores them in the reply ([anonymizing text for ChatGPT](/anonymize-text-for-chatgpt/)).

## A note on the 2023 save bug

In 2023, researchers showed that Snipping Tool could leave cropped-out image data in a file when you saved over the original. Microsoft tracks it as [CVE-2023-28303](https://msrc.microsoft.com/update-guide/vulnerability/CVE-2023-28303) and fixed it in Snipping Tool 11.2302.20.0. The [Quick redact guide](/guides/snipping-tool-quick-redact-limits/) covers the details. RedactPal sidesteps the whole class of problem: every export is a new image built from pixels, with nothing carried over from the original file.

## The verdict

Use Quick redact when the only thing on screen is an email address and you are already in Snipping Tool. For everything else, use RedactPal. It finds the card, the IBAN and the API key as well as the email, covers them with boxes that cannot be peeled back, works on PDFs and text, and does it on Windows, Mac or a phone without an account or an upload. [Open RedactPal](/redact-screenshot/) and paste your snip. See also the [best free redaction tools in 2026](/guides/best-free-redaction-tools/) and [why blurring is not enough](/guides/can-blurred-text-be-unblurred/).

Snipping Tool and Windows are trademarks of their owner. RedactPal is not affiliated with Snipping Tool or Microsoft.
