# Brief: /compare (landing page, wave 2 #6)

## Target queries
- **Primary:** best free redaction tool (screenshot / PDF)
- **Secondary:** RedactPal vs Snipping Tool · RedactPal alternative · Adobe Acrobat redact alternative free · redaction tool that doesn't upload · free screenshot redaction tool comparison · PDF24 vs Smallpdf redact

## Search intent
Commercial investigation. They're choosing a tool and want a quick verdict by use case: screenshot vs PDF vs text, privacy, cost.

## SERP snapshot (2026-11-15)
- Comparison listicles are mostly written by vendors that rank themselves #1: blur.me (6 tools; inconsistent counts and prices), wildandfreetools (lists its own tool first; "Every tool on this list does genuine permanent redaction"; excludes Preview, Edge and Chrome viewers as annotation-only), redactable.com (several "best free" posts), doczen pages.dev, thedigitalprojectmanager, itechguides, sourceforge.
- softpicker "(7 Tools Tested)": the most methodical, with verification by `pdftotext`, `exiftool` and a hex editor. Rates DocHub as "visual overlay only" and lists free limits (Sejda 3 tasks/day and 50 MB; AvePDF 2 tasks per 6 hours; PDF24 unlimited). **Verify each on the vendor page before citing.**
- No comparison covers **screenshots plus PDFs plus text** together, and none compares auto-detection of secrets.

## Title
- **Recommended:** RedactPal vs Other Redaction Tools – Free, Tested
- **Alt 1:** Best Free Redaction Tool? RedactPal Compared (2026)
- **Alt 2:** RedactPal vs Acrobat, Snipping Tool, PDF24 & More

**Meta description:** RedactPal vs Acrobat, Snipping Tool, Preview, PDF24 and online redactors: price, uploads, auto-detection and permanence, tested on the same files.

## H1
RedactPal compared: which redaction tool to use, and when

## Direct answer (40–60 words)
> For screenshots, PDFs and text you need to share safely and for free, use RedactPal. It costs nothing, needs no account, never uploads your file, auto-detects keys, card numbers and IBANs, and only uses solid boxes. For court filings that must keep searchable text, use Acrobat Pro's Redact plus Sanitize, then verify the result.

## Outline
- **Disclosure line** (top): "We make RedactPal. Every tool below was tested on <date> with the same three files; evidence is linked."
- **H2: The short answer by job** A table, Job → Pick → Why: screenshot with keys → RedactPal; bank statement PDF → RedactPal; AI-chat text → RedactPal text mode; long legal PDF needing searchable output → Acrobat Pro (paid); quick email/phone hide in Windows → Snipping Tool Quick redact is OK if nothing else sensitive is on screen.
- **H2: Comparison table** Rows: RedactPal, Adobe Acrobat Pro, Windows Snipping Tool, macOS Preview, iPhone Markup, Google Photos Redact, PDF24, Smallpdf, redact.dev Screenshot Redactor, picssizer. Columns: Price/limits · Uploads file? · Account needed? · Auto-detects (what) · Redaction method (solid / blur / annotation) · Text under box removed? · Metadata removed? · Open source? · Works offline? Each cell gets a source or "our test".
- **H2: How we tested** Three files: (1) a fake terminal screenshot with keys, (2) a 3-page Word-exported PDF with an IBAN, a name and an email, (3) a scanned page. Checks: Ctrl+A copy/paste, `pdftotext`, `exiftool`, brightness/levels on images, and a network monitor for uploads.
- **H2: Where RedactPal wins** Price (free, unlimited), no upload (CSP), open source, no account, auto-detection of keys/cards/IBANs, solid boxes only, offline, self-hostable.
- **H2: When to use something else** One short paragraph: you need the redacted PDF to stay text-searchable (Acrobat + Sanitize), or batch redaction of thousands of files on a server (Stirling PDF self-hosted).
- **H2: Head-to-head pages** Short sections or links: vs Snipping Tool · vs Preview · vs iPhone Markup · vs Google Photos Redact · vs online PDF redactors.
- **H2: FAQ**

## Facts to include (verified; competitor claims must be re-checked on the day)
- Snipping Tool Quick redact covers "email addresses or phone numbers". OCR is "performed locally on your device". https://support.microsoft.com/en-us/windows/use-snipping-tool-to-capture-screenshots-00246869-1843-655f-f220-97299b865f6b
- Google Photos Redact pen = blur/pixelate (9to5Google, 24 Sep 2026): https://9to5google.com/2026/09/24/google-photos-redact-moods/
- iPhone Markup marker is semi-transparent (9to5Mac 2018): https://9to5mac.com/2018/03/13/ios-markup-reveal-redact-sensitive-info/
- Preview Redact removed visible text but left off-page/hidden text in the Eclectic Light test (macOS 11, 11 Dec 2020); re-test on the current macOS: https://eclecticlight.co/2020/12/11/how-effective-and-safe-is-previews-redaction-tool/
- redact.dev Screenshot Redactor says "The picture is never uploaded" and offers blur/pixelate as well as black out: https://redact.dev/tools/screenshot-redactor
- picssizer: manual boxes only, local processing, GPS not copied (their page): https://picssizer.pages.dev/redact-image
- PoPETs 2023: 2 of 11 PDF redaction tools didn't remove text; rasterization is an effective defense: https://petsymposium.org/popets/2023/popets-2023-0069.pdf
- **Re-verify on the vendor page before publishing:** Acrobat pricing and trial length; PDF24 free/no-limit claims; Smallpdf free-tier limits and upload behavior; Sejda/AvePDF limits. Don't copy them from listicles.

## RedactPal demo / test to show
Run the 3-file test across all tools in one session. Screenshot each result. Publish a results table with ✔/✘ and the evidence images, plus the test files for download.

## Internal links
`/` · `/guides/best-free-redaction-tools-tested` · `/guides/snipping-tool-quick-redact-limits` · `/guides/redact-pdf-mac-preview` · `/guides/iphone-markup-redaction-safe` · `/self-hosted-redaction`

## Target length
1,500–2,200 words, table-first.

## What competitors miss
- Screenshot plus PDF plus text in one comparison.
- Auto-detection of secrets as a criterion.
- A real, reproducible test with downloadable files.
- Honest "use X instead when…". It makes the recommendation credible.

## Avoid
- Unsourced competitor weaknesses, outdated prices, or "X uploads your data" without the vendor's own statement.
- Calling Snipping Tool or Preview "unsafe" across the board. Say exactly what each did in our test.
