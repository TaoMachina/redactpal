---
title: How to Check If a PDF Redaction Worked (4 Quick Tests)
description: "Four checks show whether redacted text is really gone from a PDF: select-and-copy, search, text extraction and metadata. No special software needed."
h1: How to check if a PDF redaction actually worked
published: 2026-11-15
updated: 2026-11-15
draft: false
toc: auto
cta:
  tool: redact-pdf
  title: Redact a PDF so the text is really gone
  text: RedactPal rebuilds every page from pixels, so nothing sits under the boxes and no metadata is carried over. Free, MIT-licensed, no account, nothing is uploaded.
  button: Redact a PDF
howto:
  name: How to check if a PDF redaction worked
  description: Four tests that show whether redacted text is still inside a PDF file.
  steps:
    - name: Select all, copy and paste
      text: Open the PDF, press Ctrl+A (⌘A), copy, and paste into a plain text editor. Redacted words must not appear.
    - name: Search for the redacted words
      text: Press Ctrl+F (⌘F) and search for a name or number you covered. There should be no hits.
    - name: Extract the text
      text: Run pdftotext file.pdf - or a PyMuPDF one-liner and search the output for the redacted terms, including text outside the page edges.
    - name: Check metadata, comments and attachments
      text: Run exiftool file.pdf and look at the viewer's comments, attachments and form-field panels.
related:
  - redact-pdf
  - guides/can-blurred-text-be-unblurred
  - redact-bank-statement
faq_title: Checking redacted PDFs — questions
faq:
  - q: Can I check a PDF someone else sent me?
    a: Yes. The four tests need only the file. If the sender covered text with boxes and the text still copies out, anyone can read it, so tell them rather than passing it on.
  - q: Does printing to PDF fix a bad redaction?
    a: Not by itself. Howard Oakley found that printing or exporting from macOS Preview did not remove text that was hidden off the page edge. Whether a given print driver flattens the page depends on the driver, so run the four tests on the new file instead of assuming.
  - q: Is flattening the same as redaction?
    a: No. Flattening merges annotations such as comments and form fields into the page. A black rectangle drawn over text can be flattened and the text under it is still in the file. Redaction means the text is removed, or the page is rebuilt as an image.
  - q: Why can I still select text elsewhere in my redacted PDF?
    a: That is normal for tools that edit the PDF in place. They only have to remove the redacted spans. Run the tests on the redacted words, not on the whole page.
---

**Open the redacted PDF, press Ctrl+A (⌘A on Mac), copy, and paste into a plain text editor.** If any hidden word appears, the redaction failed. Then search for each redacted term, extract the text with `pdftotext`, and look at the file's metadata and comments. A properly redacted file passes all four checks.

A black box in a PDF is only a picture of a box. Whether the words underneath are gone depends on how the box was made. Drawing a rectangle on top of text leaves the text in the file, and anyone can copy it. That is how a January 2019 court filing in the Manafort case exposed its blacked-out passages: a reporter [found the text could be copied and pasted into a new document](https://www.cjr.org/analysis/manafort-mueller-redacted-document-ukraine.php) (Columbia Journalism Review). You can run the same check on your own file in two minutes.

## Test 1: Select all, copy, paste

1. Open the PDF in your viewer.
2. Press **Ctrl+A** (⌘A) to select everything, then **Ctrl+C** (⌘C).
3. Paste into a plain text editor (Notepad, or TextEdit in plain-text mode).
4. Look for the words you redacted.

Do this in two different viewers, for example your browser and a desktop reader. A viewer can hide text that another one shows.

If a redacted word shows up, the box is cosmetic. Stop and redo the redaction.

## Test 2: Search for the hidden words

Press **Ctrl+F** (⌘F) and search for a name, number or phrase you covered. Try a partial match too: the last four digits of an account number, or a surname on its own. A hit on a covered spot means the text is still in the file. Also search for words that sit right at the edge of a box, since a tool that clips text can leave fragments.

## Test 3: Extract the text

Viewers can behave differently from the file. Extracting the text reads the file directly.

With [Poppler](https://poppler.freedesktop.org/) installed:

```bash
pdftotext redacted.pdf - | grep -i "12345678"
```

Or with Python and PyMuPDF:

```bash
python -c "import fitz; print(''.join(p.get_text() for p in fitz.open('redacted.pdf')))"
```

Search the output for every redacted term. This can also catch text outside the visible page. Howard Oakley tested macOS Preview's redaction on a file with text running past the page edge: [Preview removed the text under the box but left the off-page text in place](https://eclecticlight.co/2020/12/11/how-effective-and-safe-is-previews-redaction-tool/), and printing or exporting to PDF did not change that. That was macOS 11 in December 2020, so treat it as a reason to test, not as a statement about today's version.

## Test 4: Metadata, comments, attachments and form fields

Text on the page is not the only place data hides. Check:

- **Document properties.** `exiftool redacted.pdf` lists title, author, creator and dates. A document title like "Settlement - John Smith" defeats the purpose.
- **Comments and annotations.** Open your viewer's comments panel. Sticky notes and highlights can quote the redacted text.
- **Attachments.** Many viewers show an attachments panel. Embedded files are not touched by drawing over a page.
- **Form fields.** Filled-in fields keep their values even when a box covers them.

## Scanned PDFs: the hidden OCR layer

A scanned page is an image, but many scanners and apps add an invisible text layer from optical character recognition so the document is searchable. If you draw over the image, that text layer is still there. Test 1 and Test 3 catch it: if the pasted text contains your redacted words, the OCR layer is intact.

## Advanced: what even real redaction can leak

Passing the four tests means the text is gone. It does not mean the box reveals nothing. In *Story Beyond the Eye: Glyph Positions Break PDF Text Redaction* (Bland, Iyer and Levchenko, [PoPETs 2023](https://petsymposium.org/popets/2023/popets-2023-0069.php)), researchers examined 11 PDF redaction tools and found that all of them leaked information about redacted text. Two did not remove the text at all. They also found 6,541 nonexcised redacted names in 710 US court documents. The spacing of the characters around a redaction can narrow down a short name, and rasterizing the page (turning it into an image) reduces the leak but does not remove it: in one experiment, quantizing redaction widths to 300 DPI still left about 8 bits of information on average.

For most documents this does not matter. It matters when the hidden item is short and guessable, such as a name from a known list. In that case, cover the whole line or field, not just the word, so the box width says less.

## It failed. Now what?

1. **Go back to the original file** and redo the redaction. Do not stack more boxes on the failed copy.
2. **Use a tool that removes content or rebuilds the page**, then run all four tests again.
3. **If you already sent the file,** tell the recipient, ask them to delete it, and treat anything it exposed (account numbers, passwords, keys) as compromised. See [what to do after a leaked key](/guides/api-key-leaked-in-screenshot-what-to-do/) for the general approach.

## How RedactPal approaches the four tests

[RedactPal](/redact-pdf/) is free, MIT-licensed and needs no account. It runs in your browser and your file is never uploaded. When you export a PDF, it does not edit your file. It renders each page to pixels, draws solid boxes, and builds a brand-new PDF made only of page images. The [exporter's source](https://github.com/stefano2007517-star/redactpal/blob/main/src/pdf/flatten.ts) states that the original PDF is never loaded into the output document, and the only metadata it sets is a `Producer` entry.

By design, that means:

- **Tests 1, 2 and 3:** there is no text layer to copy, search or extract.
- **Test 4:** no author, title, dates, comments, attachments or form data come across.

We are describing the design here, not reporting a lab study, so confirm it on your own file with the tests above. The trade-off is that the exported PDF is not searchable. If the recipient needs to search it, run OCR on the redacted copy, and then run Test 1 again.

<!-- cta -->

Drop the PDF into [RedactPal](/redact-pdf/), check the highlighted items, and download. For a related case, see [how to redact a bank statement](/redact-bank-statement/), or read why [blurring is not a substitute](/guides/can-blurred-text-be-unblurred/).
