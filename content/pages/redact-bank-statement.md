---
title: Redact a Bank Statement Free – Keep What Lenders Need
description: Hide account numbers, card numbers and spending on a bank statement PDF or screenshot, and keep what landlords and lenders check. Free, nothing uploaded.
h1: Redact a bank statement without uploading it
intro: RedactPal is free, open source (MIT) and needs no account. Drop a statement PDF or screenshot, hide what the recipient doesn't need, and download a copy where the hidden text is really gone. Nothing is uploaded.
accept: any
nav_label: Redact a bank statement
nav_order: 40
published: 2026-11-15
updated: 2026-11-15
draft: false
related:
  - guides/is-it-safe-to-send-bank-statement-screenshot
  - guides/how-to-check-if-pdf-redaction-worked
  - redact-pdf
faq_title: Redacting bank statements – questions
faq:
  - q: Is it legal to redact my own bank statement?
    a: Hiding details on your own copy, such as an account number or unrelated purchases, is normal. Changing figures, dates or names is different, because that alters the document. Never edit amounts. Rules differ by country and recipient, so ask the recipient what they accept.
  - q: Will a lender accept a redacted statement?
    a: It depends on the lender. US mortgage guidance from Fannie Mae asks for all deposits and withdrawals plus at least the last four digits of the account number, so heavy redaction can get a statement rejected there. Ask the recipient before you hide any transactions.
  - q: Can the bank details be recovered from the redacted PDF?
    a: No. Every page is rebuilt from pixels with the boxes burned in, and the original text and metadata are not carried over. See [how to check that a PDF redaction worked](/guides/how-to-check-if-pdf-redaction-worked/).
  - q: Can I search the redacted PDF?
    a: No. The export is an image-only PDF, so text can't be selected or searched. Keep your original for your own records and send the redacted copy.
  - q: Does RedactPal find my account number automatically?
    a: Yes. Labelled account numbers ("Account number", "Acct", "A/C No."), US routing numbers (checked against the ABA checksum) and UK sort codes are boxed automatically, along with IBANs, card numbers, emails and phone numbers. Anything else takes one drag, and RedactPal offers to hide it everywhere it appears.
  - q: Does it work on my phone?
    a: Yes. Open redactpal.com in a mobile browser, pick the PDF or a photo, redact it and share the result. Nothing leaves the phone.
---

## How to redact a bank statement

1. **Drop the statement** on this page: the PDF from your bank, or a screenshot or photo. On a phone, tap **Choose a photo or PDF**.
2. **Check the highlights.** Account numbers, routing numbers, sort codes, IBANs, card numbers, emails and phone numbers are found for you. Tap one to keep it visible.
3. **Drag a box** over everything else the recipient doesn't need, such as unrelated transactions, merchant names or your home address.
4. **Download**, then open the file and page through it before you send it.

## What should you redact on a bank statement?

| Hide | Keep (usually needed) |
|---|---|
| All but the last 4 digits of the account number and IBAN | Your name |
| Card numbers | The bank's name |
| Sort code or routing number, if the recipient doesn't need it | The statement period and dates |
| Unrelated transactions: medical, personal transfers, merchant names | Salary and other deposit lines |
| Customer reference numbers, email, phone, home address | The ending balance and the last 4 account digits |

Over-redacting can make a statement look incomplete. Hide only what the recipient doesn't need.

## What do lenders and landlords actually check?

It varies, so ask first. One concrete example is US mortgage lending. Fannie Mae's Selling Guide, section [B3-4.2-01](https://selling-guide.fanniemae.com/sel/b3-4.2-01/verification-deposits-and-assets) (version dated 05/04/2022, checked November 2026), says statements must clearly identify the financial institution and the borrower as account holder. They must include at least the last four digits of the account number, the time period covered, all deposit and withdrawal transactions, and the ending balance. It also accepts statements the borrower downloaded online.

That is US guidance for mortgages, and other lenders and countries differ. The practical rule: **ask before you redact transactions for a mortgage**, because the lender may need complete statements.

For rentals, the FTC's [rental listing scams page](https://consumer.ftc.gov/articles/rental-listing-scams) (June 2026) says a landlord doesn't need your Social Security number, credit score or other sensitive information. It also advises never giving personal or financial information to anyone who contacts you. Send only what a genuine application asks for, to a person you have verified.

## Redact a PDF statement or a screenshot?

Prefer the PDF downloaded from your bank: it is complete and dated. RedactPal handles both. Scanned pages and photos are read with on-device text recognition (OCR), so check those pages carefully and drag over anything it missed. A screenshot is fine for a quick share, and our guide covers [whether it is safe to send a bank statement screenshot](/guides/is-it-safe-to-send-bank-statement-screenshot/).

## Why not just draw black boxes in a PDF editor?

Many editors draw a black shape on top of the text and leave the text underneath, so anyone can select and copy it. RedactPal doesn't reuse your file. Each page is drawn as an image with solid boxes painted in, and a new PDF is built from those images. Metadata such as author and title is dropped. The [PDF tool](/redact-pdf/) works the same way.

## How to check the redacted file

Open the downloaded PDF, press Ctrl+A / ⌘A, copy, and paste into a text editor. Nothing should paste. Then page through every file and look for any account number you meant to hide. The [full check](/guides/how-to-check-if-pdf-redaction-worked/) has more tests.

## Altering a statement is not redacting

Redacting hides information. Changing an amount, date or name alters the document, and that can be fraud. RedactPal only covers content with boxes. It never edits it.

Open the [tool](/) any time, or read the [source on GitHub](https://github.com/TaoMachina/redactpal).
