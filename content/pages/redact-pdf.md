---
title: Redact a PDF Online Free — No Upload | RedactPal
description: Black out names, account numbers, emails and signatures in a PDF, right in your browser. Text under the boxes is really gone. Free, nothing is uploaded.
h1: Redact a PDF in your browser.
intro: Drop a PDF, check what will be hidden on every page, and download a copy where the text under each box is gone for good. Nothing is uploaded.
accept: pdf
nav_label: Redact a PDF
nav_order: 10
published: 2026-11-15
updated: 2026-11-15
draft: false
related:
  - guides/can-blurred-text-be-unblurred
faq_title: Redacting PDFs — questions
faq:
  - q: Can someone copy the text out from under the black boxes?
    a: No. The downloaded PDF is not your original file with shapes drawn on top. Every page is rendered to an image with the boxes burned in, and a new PDF is built from those images, so there is no text layer left to select, copy or search.
  - q: Does it work on scanned PDFs?
    a: Yes. Pages without a text layer are read with on-device text recognition (OCR). Check those pages carefully, since OCR can miss small or faint text — drag over anything it didn’t catch.
  - q: Is there a page limit?
    a: RedactPal handles up to 200 pages at a time. Split longer documents into parts first.
  - q: Can I redact a password-protected PDF?
    a: Not directly. Open it with the password, save or print it to a new PDF without one, and redact that copy.
  - q: Is the redacted PDF still searchable?
    a: The redacted copy is made from page images, which is what guarantees the hidden text is gone for good. Keep your original if you need a searchable version for yourself.
---

## How to redact a PDF

1. **Drop the PDF** on this page, or tap **Choose a PDF**. It is opened in your browser; it is not sent anywhere.
2. **Check every page.** Email addresses, phone numbers, card numbers, IBANs, bank account and routing numbers, US Social Security numbers, API keys and passwords are highlighted for you.
3. **Add what was missed.** Drag a box over anything else — a name, a signature, an address, a photo. Mark a name once and RedactPal offers to hide it on every page where it appears.
4. **Download** the redacted PDF and open it once to check before you send it.

## Why most “redacted” PDFs aren’t

Drawing a black rectangle over text in a PDF editor usually just adds a shape on top. The words are still in the file: select the area, copy, and paste them somewhere else, or search the document for them. Hidden layers, form fields, comments and document properties (author, title, the software that made it) can give away even more.

RedactPal avoids all of this by not reusing your file at all. Each page is drawn as an image with the boxes painted in, and a brand-new PDF is made from those images. Fonts, text, links, annotations, attachments and metadata from the original are not carried over.

## Built for redactions that hold

- **Automatic where it can be exact.** Emails, phone numbers, card and account numbers, IDs and API keys are found by their format and checksums. Names and addresses take one drag — then every other occurrence is offered too.
- **Nothing hidden survives.** Every page is rebuilt from pixels, so the words under a box are not in the file at all — there is nothing to select, search or copy back out.
- **You approve every box.** The final preview shows exactly what the recipient will see before you download.

Need to hide something in a screenshot or a block of text instead? The [main tool](/) handles images and text the same way, and our guide explains [why blurring is not a safe substitute](/guides/can-blurred-text-be-unblurred/).
