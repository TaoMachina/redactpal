# Brief: /guides/how-to-check-if-pdf-redaction-worked (guide, wave 1 #4)

## Target queries
- **Primary:** how to check if a PDF redaction worked
- **Secondary:** verify PDF redaction · test redacted PDF · can redacted PDF text be copied · how to tell if a PDF is properly redacted · unredact PDF copy paste · check redacted PDF metadata

## Search intent
Informational and procedural. Either "I'm about to send a redacted PDF" or "I received one and wonder". They need quick tests anyone can run, plus deeper ones.

## SERP snapshot (2026-11-15)
- Vendor KBs: Qoppa PDF Studio "How do I make sure that my document was correctly redacted…"; Xodo/Apryse "Applying Redactions"; WPS "How to verify if a PDF redaction is secure"; Nutrient "PDF redaction verification: How to prove sensitive data is permanently removed".
- Artifex "Unmasking Fake Redactions With PyMuPDF" (developer).
- aona.ai, toolhut.pages.dev "pdf redaction black box not enough", wildandfreetools checklist, revpdf.
- cyber.gov.au: "An Examination of the Redaction Functionality of Adobe Acrobat Pro DC 2017" (Oct 2021, PDF). Primary and authoritative; writer should read and cite specific findings.
- Common tests named: select/drag, Ctrl+F search, another viewer, `pdftotext`/PyMuPDF, metadata, scanned OCR layer, comments and form data.

Missing everywhere: **the box-width leak** (PoPETs 2023). Even correctly removed text can leak its length and glyph spacing.

## Title
- **Recommended:** How to Check If a PDF Redaction Worked (4 Quick Tests)
- **Alt 1:** Is My PDF Really Redacted? 4 Tests Anyone Can Run
- **Alt 2:** Verify a Redacted PDF: Copy, Search, Extract, Metadata

**Meta description:** Four tests show whether redacted text is really gone from a PDF: select-and-copy, search, text extraction and a metadata check. Free, about 2 minutes.

## H1
How to check if a PDF redaction actually worked

## Direct answer (40–60 words)
> Open the redacted PDF, press Ctrl+A (⌘A) and copy, then paste into a plain text editor. If any hidden words appear, the redaction failed. Then search for each redacted term, extract the text with `pdftotext`, and check the file's metadata and comments. A properly redacted file passes all four tests.

## Outline
- **H2: Test 1: Select all, copy, paste** In two viewers (browser plus Acrobat/Preview). Screenshot both outcomes.
- **H2: Test 2: Search for the hidden words** Ctrl+F / ⌘F for a name or number you redacted.
- **H2: Test 3: Extract the text** `pdftotext file.pdf -` (Poppler); Python PyMuPDF one-liner; online-free option: open in a browser and save as text. Explain that this catches text hidden off-page, too (Eclectic Light found Preview left off-page text).
- **H2: Test 4: Metadata, comments, attachments, form fields** `exiftool file.pdf`; Acrobat's Document Properties; comments pane; attachments pane.
- **H2: Scanned PDFs: the hidden OCR layer** A scan may carry an invisible text layer. Test 1 catches it.
- **H2: Advanced: what even "real" redaction can leak** PoPETs 2023: box width and glyph positions can narrow down short names. Rasterizing helps but box width still leaks some information. Advice: for short names, consider covering the whole field or line.
- **H2: It failed. Now what?** Redo it from the original with a tool that removes content (don't stack more boxes). If you already sent it, notify the recipient.
- **H2: How RedactPal passes all four** Rebuilt from pixels: no text layer, no metadata, no annotations (CTA). Show our own test results.
- **H2: FAQ**
  - Can I check a PDF someone sent me? (yes, the same tests)
  - Does printing to PDF fix a bad redaction? (Eclectic Light found print/export from Preview didn't remove hidden text. Test others before claiming.)
  - Is flattening the same as redaction?
  - Why does my redacted PDF still have selectable text elsewhere? (normal for non-rasterizing tools; only the redacted spans must be gone)

## Facts to include (verified)
- PoPETs 2023, Bland et al.: two of 11 tools "leave the text underneath the selection marked for redaction"; 6,541 nonexcised redacted names in 710 US court documents. Rasterizing tools still leak "the approximate width of redacted text from the spacing between glyphs on either side". At 300 DPI, ~8 bits of information on average in their experiment. https://petsymposium.org/popets/2023/popets-2023-0069.pdf
- Eclectic Light (Howard Oakley, 11 Dec 2020, macOS 11): Preview removed visible text but not text extending off the page edge; print/export didn't change that. https://eclecticlight.co/2020/12/11/how-effective-and-safe-is-previews-redaction-tool/
- Manafort filing (8 Jan 2019), copy-paste: https://www.cjr.org/analysis/manafort-mueller-redacted-document-ukraine.php
- **Writer must open and cite specific findings:** ASD/ACSC, "An Examination of the Redaction Functionality of Adobe Acrobat Pro DC 2017" (Oct 2021): https://www.cyber.gov.au/sites/default/files/2023-03/PROTECT%20-%20An%20Examination%20of%20the%20Redaction%20Functionality%20of%20Adobe%20Acrobat%20Pro%20DC%202017%20%28October%202021%29.pdf
- **Not opened; cite only after reading:** NSA "Redacting with Confidence" (Dec 2005), copy hosted by the 7th Circuit: https://www.ca7.uscourts.gov/assets/pdf/nsa-redact.pdf

## RedactPal demo / test to show
1. Make "bad.pdf" (black rectangle annotation over text in any editor) and "redactpal.pdf" (same source exported by RedactPal).
2. Run all 4 tests on both; show the terminal output side by side.
3. Offer both files for download so readers can practice.

## Internal links
`/redact-pdf` (primary CTA, or `/` until it's live) · `/guides/why-pdf-redactions-fail` · `/guides/redact-pdf-mac-preview` · `/redact-bank-statement`

## Target length
1,300–1,700 words.

## What competitors miss
- A vendor-neutral protocol (KB pages test only their own app).
- The off-page text and box-width leaks.
- Practice files.

## Avoid
- Saying "if Test 1 passes you're safe". Present all four.
- Overstating the box-width attack for ordinary use. It matters most for short, guessable items (names from a known list).
