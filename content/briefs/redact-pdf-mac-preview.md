# Brief: /guides/redact-pdf-mac-preview (guide, wave 2 #5)

## Target queries
- **Primary:** how to redact a PDF on Mac Preview
- **Secondary:** Preview redact tool missing · is Preview redaction permanent · redact PDF on Mac free · Mac Preview black out text · Preview redact vs Acrobat

## Search intent
How-to, plus "is it actually safe?". Mac users who don't want to pay for Acrobat.

## SERP snapshot (2026-11-15)
- howtogeek "How to Redact a PDF in Preview on Mac" (fetch failed; listed in the SERP).
- Adobe hub "how to redact PDF on Mac" (pushes Acrobat); macro.com "How to redact a PDF on Mac: 3 simple methods"; redactable; macmost; setapp "with or without Adobe Acrobat"; swifdoo "4 Easy Ways"; UPDF; Wondershare; wps; docfly; pdfpro.
- intego "Securely Redact Text in PDFs with Apple Preview on Mac" (Kirk McElhearn, 24 Dec 2024): "as soon as you save the document, the redaction is permanent". **No test described.**
- eclecticlight.co "How effective and safe is Preview's redaction tool?" (Howard Oakley, 11 Dec 2020, macOS 11): visible text removed (minor fragments), **off-page text not removed**.
- Apple Community threads: residual searchable text until the file is closed and reopened (thread 255293453); "redact tool is missing" threads.
- Conflict: softpicker says Preview does true redaction "since Ventura"; others say Big Sur. No official Apple page found.

Patterns: "How to Redact a PDF on Mac: N Ways", "with or without Adobe".

## Title
- **Recommended:** How to Redact a PDF in Mac Preview (and Check It Worked)
- **Alt 1:** Mac Preview Redact Tool: Is It Permanent? (Tested)
- **Alt 2:** Redact a PDF on Mac for Free: Preview vs RedactPal

**Meta description:** Use Preview's Redact tool step by step, then confirm the text is really gone. Our macOS test, the hidden-text gap, and a free no-upload alternative.

## H1
How to redact a PDF in Preview on Mac, and check that it worked

## Direct answer (40–60 words)
> Open the PDF in Preview, choose **Tools → Redact**, drag over the text and save. Preview removes the visible text under the boxes when you save. Close and reopen the file, then search for and copy the redacted words to confirm they're gone. Don't use shapes or highlights: those only cover the text.

## Outline
- **H2: Step by step (macOS <version>)** Duplicate the file → Tools → Redact (or Markup toolbar → Redact) → drag → File → Save → close → reopen. Screenshots.
- **H2: Can't find the Redact tool?** Where it lives on current macOS; requires macOS 11 or later (verify on the test machine).
- **H2: Is Preview's redaction permanent? Our test** Run on the current macOS: copy-paste, Ctrl+F, `pdftotext`, `exiftool`. Include a test file with text running off the page edge (recreating Eclectic Light's 2020 test). Report what happens now.
- **H2: Shapes and highlights are not redaction** Preview warns about this (verify the wording on screen).
- **H2: What about metadata?** Check Tools → Show Inspector for author/title; `exiftool`.
- **H2: Alternative: RedactPal in Safari** Auto-detects numbers and keys across all pages, rebuilds pages from pixels (removes hidden text and metadata too), no install (CTA).
- **H2: FAQ**
  - Can I undo a redaction in Preview? (before saving: ⌘Z; after: no; keep the original copy)
  - Why is the redacted text still searchable? (Apple Community: until closed and reopened; verify)
  - Does Preview redact images inside the PDF? (test)
  - Is Preview good enough for legal filings? (point to the checks; don't give legal advice)

## Facts to include (verified)
- Eclectic Light (Howard Oakley, 11 Dec 2020, macOS 11): "Preview's redaction tool actually does appear to do quite a good job, as far as it can see text"; did not remove text extending off the page; print/export didn't fix it. https://eclecticlight.co/2020/12/11/how-effective-and-safe-is-previews-redaction-tool/
- Apple Community (Nov 2023, macOS 11.3): the asker reported redacted text still searchable; a reply says it's not found after quitting Preview and reopening. https://discussions.apple.com/thread/255293453
- Intego (24 Dec 2024): "as soon as you save the document, the redaction is permanent". Before saving, hovering reveals the text. https://www.intego.com/mac-security-blog/securely-redact-text-in-pdfs-with-apple-preview-on-mac
- **Unverified (conflicting):** whether full redaction arrived in Big Sur (11) or Ventura (13). Test, and state only the version you tested.

## RedactPal demo / test to show
Same test PDF through Preview and through RedactPal; a table of the 4 test results each. Include the off-page text case.

## Internal links
`/redact-pdf` (primary CTA, or `/` until live) · `/guides/how-to-check-if-pdf-redaction-worked` · `/guides/why-pdf-redactions-fail` · `/compare`

## Target length
1,200–1,500 words.

## What competitors miss
- A current-macOS test, including the off-page/hidden-text case.
- The "close and reopen before checking" step.
- A version note backed by testing instead of guesses.

## Avoid
- Repeating 2020 findings as current without re-testing.
- Calling Preview unsafe if our test passes. Report results as they are.
