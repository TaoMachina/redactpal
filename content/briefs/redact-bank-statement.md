# Brief: /redact-bank-statement (landing page, wave 1 #4)

## Target queries
- **Primary:** redact bank statement
- **Secondary:** how to redact a bank statement · black out account number on bank statement · redact bank statement for landlord / rental application · redact bank statement for mortgage · redact bank statement PDF free · what to redact on a bank statement

## Search intent
Transactional plus "what exactly should I hide?" The searcher must send proof of funds or income to a landlord, lender, visa office, accountant or employer and wants to hide the account number and unrelated spending without the document being rejected.

## SERP snapshot (2026-11-15)
| Result | Title / H1 | Notes |
|---|---|---|
| updf.com/knowledge/redact-bank-statement | (desktop app funnel) | Vendor tutorial |
| xodo.com/blog/how-to-redact-bank-statement-pdf | H1 "How to Redact a Bank Statement PDF Safely" | 7 Mar 2025, Reena Cruz. ~1,200 words. H2s by method (offline app / web / mobile), "Common mistakes", an 8-question FAQ. Doesn't say clearly what to keep. Online upload behavior stated inconsistently. |
| swifdoo.com | "How to Redact Bank Statement in 3 Easy/Secure Ways [Detailed Steps]" | Bracket pattern |
| smallpdf.com/blog/redact-bank-statement-pdf | Smallpdf | Cloud tool |
| redactable.com/blog/redacted-bank-statement | H1 "What is a redacted bank statement & how to redact it in 2026" | Updated 5 Jan 2026. ~3,000+ words. Best "what to redact vs keep" list (last 4 digits; keep deposits for income proof; over-redacting raises authenticity questions). No FAQ. |
| wildandfreetools, doczen pages.dev, cachera pages.dev | Small tool sites | Thin |

Patterns: "How to Redact a Bank Statement", "[Detailed Steps]", "in 2026", "Safely". Missing from all: the lender's actual requirements, cited from source.

## Title
- **Recommended:** Redact a Bank Statement Free – Keep What Lenders Need
- **Alt 1:** How to Redact a Bank Statement (Without Uploading It)
- **Alt 2:** Redact Bank Statement PDF Free – Account Numbers Hidden

**Meta description:** Hide account numbers, card numbers and spending on a bank statement PDF or screenshot, and keep what landlords and lenders check. Free, nothing uploaded.

## H1
Redact a bank statement without uploading it

## Direct answer (40–60 words)
> Drop the statement PDF or screenshot into RedactPal. Account numbers, IBANs, card numbers and emails are boxed automatically. Drag over any transactions the recipient doesn't need, keep the last four account digits, your name, the bank and the dates, then download. Every page is rebuilt from pixels, so the hidden numbers can't be copied back out.

## Outline
- **[Tool + 4 steps]**
- **H2: What should you redact on a bank statement?** Two-column table, Hide vs Keep:
  - Hide: all but the last 4 digits of the account number, IBAN, card numbers, sort code/routing (if the recipient doesn't need it), unrelated transactions (merchant names, medical, personal transfers), customer reference numbers, email and phone.
  - Keep (usually required): your name, the bank's name, the statement period, deposits/salary lines, ending balance, last 4 account digits.
- **H2: What do lenders and landlords actually check?** Quote Fannie Mae B3-4.2-01: statements must identify the institution and the borrower, include at least the last four digits, the period, all deposits and withdrawals, and the ending balance. So **ask before you redact transactions for a mortgage**: lenders may require complete statements. Landlords: FTC says a landlord doesn't need your SSN until you've agreed to rent.
- **H2: Redact a PDF statement vs a screenshot** Prefer the bank's downloaded PDF (complete and dated). RedactPal handles both. Scanned statements are OCR'd on-device.
- **H2: Why not just draw black boxes in a PDF editor?** Overlays can leave the text copyable (the Manafort filing, Jan 2019). Link `/guides/why-pdf-redactions-fail`.
- **H2: How to check the redacted file** Select-all and copy, then search for the account number. Link the check guide.
- **H2: FAQ**
  - Is it legal to redact my own bank statement? (redacting your copy is normal; altering figures is not. Never change amounts.)
  - Will a lender accept a redacted statement? (depends; Fannie Mae requires the last 4 digits and all transactions; ask first)
  - Can the bank details be recovered from the redacted PDF? (no: pixels only, metadata dropped)
  - Can I search the redacted PDF? (the export is an image PDF. Keep your original for your own records.)
  - Does it work on my phone? (yes)

## Facts to include (verified)
- Fannie Mae Selling Guide B3-4.2-01 (version 05/04/2022): statements must "clearly identify the financial institution", "clearly identify the borrower as the account holder", "include at least the last four digits of the account number", "include the time period covered", "include all deposits and withdrawal transactions", and "include the ending account balance". Downloaded statements are acceptable. https://selling-guide.fanniemae.com/sel/b3-4.2-01/verification-deposits-and-assets (US-specific; say so).
- FTC Rental Listing Scams (June 2026): "Until you've agreed to rent a place, a landlord doesn't need your Social Security number". "Never give personal or financial information to anyone who contacts you". https://consumer.ftc.gov/articles/rental-listing-scams
- FTC identity theft (Sept 2024): thieves use bank account and card numbers. The FTC recommends regularly reviewing bank statements. https://consumer.ftc.gov/articles/what-know-about-identity-theft
- Manafort filing, 8 Jan 2019: redactions defeated by copy-paste. CJR: https://www.cjr.org/analysis/manafort-mueller-redacted-document-ukraine.php

## RedactPal demo / test to show
1. Build a **fake** statement PDF (fictional bank "Example Bank", fake name, the published example IBAN `GB82 WEST 1234 5698 7654 32`, Stripe's test card `4242 4242 4242 4242`) with 2 pages and 15 transactions.
2. Screens: auto-detected IBAN/card/email → manual drag over 3 merchant lines → export.
3. Proof: open the export, Ctrl+A / ⌘A then copy and paste into Notepad (nothing pastes); `pdftotext` returns empty; file properties show no author/title.
4. Offer the fake statement as a downloadable "practice file".

## Internal links
`/` (CTA) · `/guides/is-it-safe-to-send-bank-statement-screenshot` · `/guides/how-to-check-if-pdf-redaction-worked` · `/redact-pdf` · `/guides/why-pdf-redactions-fail`

## Target length
900–1,200 words.

## What competitors miss
- The lender's actual rule (last 4 digits plus all transactions), from source.
- "Ask before you redact transactions": over-redaction gets statements rejected.
- No-upload processing for a document full of financial identifiers.

## Avoid
- Advising people to alter amounts or dates (that's document fraud). State it plainly once.
- Implying every lender accepts redacted statements.
- Calling the Fannie Mae rule universal. It's US mortgage guidance. Note that other countries and lenders differ.
