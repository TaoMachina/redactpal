# Brief: /redact-pdf (landing page, wave 2 #1)

## Target queries
- **Primary:** redact PDF (free / online)
- **Secondary:** redact pdf free online · black out text in pdf · permanently redact pdf · redact pdf without Adobe · redact pdf without uploading · redact scanned pdf

## Search intent
Transactional. A PDF must go out today with parts hidden, and the searcher wants it to stay hidden. Many have heard that "black boxes don't work".

## SERP snapshot (2026-11-15)
The strongest SERP of all our targets: brand tool pages (Adobe, Smallpdf "How to Black Out or Redact Text in a PDF | Smallpdf", Wondershare/HiPDF, UPDF, PDF4me, pdfFiller, Cloudinary helper, PDFgear, PDFBear), plus listicles:
- goldfynch.com "How to Redact PDFs Securely [It's Free and Online]"
- blur.me "How to Redact a PDF Free Online 2026: 6 Best Tools Compared (Privacy-First)". Maya Chen, 18 May 2026, 2,500–3,000 words, comparison table, "How We Tested". **Internally inconsistent** (12 vs 8 tools tested; conflicting prices).
- softpicker "How to Redact a PDF for Free in 2026 (7 Tools Tested)". 7 May 2026, no author. Verification methods include `pdftotext`, `exiftool` and a hex editor.
- edesy.in "How to Redact a PDF Free: Permanently Black Out or Mask Sensitive Text (2026)" (claims in-browser).
- Free-tier limits noted in snippets (verify before citing): PDF.it 10 redactions/day and 25 MB; Xodo 1 file/day; another tool 20 pages or 5 MB.

Patterns: "Free", "Online", "Permanently", brackets, "(N Tools Tested)", "2026". Most tools upload to a server, and most landing pages don't say how redaction removes text.

## Title
- **Recommended:** Redact a PDF Free – Nothing Uploaded, Text Truly Gone
- **Alt 1:** Redact PDF Online Free – Rebuilt From Pixels, No Upload
- **Alt 2:** Permanently Redact a PDF Free (No Upload, No Account)

**Meta description:** Black out text in a PDF and it stays gone: every page is rebuilt from pixels and metadata is removed. Free, open source, runs in your browser.

## H1
Redact a PDF for free, permanently, without uploading it

## Direct answer (40–60 words)
> Drop the PDF into RedactPal. It reads each page on your device, boxes emails, phone numbers, card numbers, IBANs and keys, and lets you drag over anything else. On export, every page is rebuilt from pixels and metadata is removed, so nothing under a box can be selected, copied or searched. Free, no account, no upload.

## Outline
- **[Tool + 4 steps]**
- **H2: Why black boxes in a normal PDF editor fail** The text stays in the file under an annotation. Cite the PoPETs 2023 finding that 2 of 11 tools "do not actually remove text", plus Manafort (Jan 2019) and the Epstein files (Dec 2025), with one line each and a link to the guide.
- **H2: How RedactPal makes redaction permanent** Pages rasterized → boxes painted into the pixels → new PDF built with pdf-lib → author/title/annotations/attachments dropped. PoPETs 2023 calls rasterization "an effective defense against deredaction".
  - H3: What the exported PDF is like: image-based pages, so hidden text is gone for good. If the recipient needs searchable text, run OCR on the redacted copy (PoPETs suggests the same).
- **H2: Scanned PDFs and screenshots inside PDFs** Pages with little or no text layer are OCR'd on-device, and embedded images get OCR too (`src/pdf/geometry.ts`).
- **H2: Redact names on every page at once** Drag once, then "hide everywhere".
- **H2: How to check the result** Link the 4-test guide.
- **H2: FAQ**
  - Is RedactPal's PDF redaction permanent?
  - Does it upload my PDF? (no)
  - Is there a page limit? (up to 200 pages per file, per `MAX_PAGES` in `src/pdf/index.ts`; split larger files)
  - Can I redact a password-protected PDF? (remove the password first. The app tells you so, per the `password` error in `src/pdf/index.ts`.)
  - Will the redacted PDF be bigger? (image pages; test and give real numbers)

## Facts to include (verified)
- PoPETs 2023, Bland, Iyer, Levchenko, "Story Beyond the Eye: Glyph Positions Break PDF Text Redaction": examined 11 popular redaction tools; "two do not work at all" (text left in the file); found 6,541 nonexcised redacted names in 710 US court documents (RECAP); "Rasterization appears to be an effective defense against deredaction." https://petsymposium.org/popets/2023/popets-2023-0069.pdf (DOI 10.56553/popets-2023-0069)
- Manafort, 8 Jan 2019: CJR https://www.cjr.org/analysis/manafort-mueller-redacted-document-ukraine.php
- Epstein files: NYT (via GV Wire, 24 Dec 2025) reported text in some released files "were not properly redacted digitally" and could be recovered by copy-paste. DOJ said the redactions were applied by parties in the civil litigation and that it "simply reproduced the materials". https://gvwire.com/2025/12/24/redacted-material-in-some-epstein-files-is-easily-recovered/
- RedactPal behavior: README "Rebuilt from pixels".

## RedactPal demo / test to show
1. Test PDF: Word-exported 3-page doc with an email, a phone, an IBAN and a name, plus one scanned page.
2. Show: auto-highlights on the text page and the scanned page; drag a name → "hide everywhere" across 3 pages.
3. Proof: `pdftotext out.pdf -` is empty; `exiftool out.pdf` shows no Author/Title; Ctrl+F for the name finds 0.
4. Record file size before and after, and time to process 10 pages on a mid-range laptop.

## Internal links
`/` (CTA) · `/guides/how-to-check-if-pdf-redaction-worked` · `/guides/why-pdf-redactions-fail` · `/guides/redact-pdf-mac-preview` · `/redact-bank-statement` · `/compare`

## Target length
1,000–1,300 words.

## What competitors miss
- Explaining **how** text is removed, with a primary source.
- No-upload processing for a free tool, with no daily limits.
- The verification step as part of the flow.

## Avoid
- Quoting rivals' free-tier limits without checking each vendor page on the day of writing.
- "Court-approved", "legally compliant".
- Saying the output keeps selectable text. It doesn't, by design. State it once, in the H3 above.
