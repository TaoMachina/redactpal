# Brief: /guides/iphone-markup-redaction-safe (guide, wave 1 #2)

## Target queries
- **Primary:** is iPhone Markup redaction safe
- **Secondary:** can marker on iPhone screenshot be removed · see through iPhone markup highlighter · how to properly redact on iPhone · can someone see under scribbles on a screenshot · remove markup from iPhone photo · iPhone markup opacity

## Search intent
Informational with anxiety. Either "I already sent a scribbled screenshot. Is it readable?" or "How do I do it right on my iPhone?"

## SERP snapshot (2026-11-15)
- 9to5mac.com 2018 "PSA: iOS Markup is not designed to be a redaction tool for sensitive information" (Benjamin Mayo): the marker is slightly transparent and lightening reveals text.
- ioshacker "How To Properly Redact Sensitive Information On iPhone Or iPad" (4 Mar 2023, ~650 words): says max-density pencil or a filled shape is fine; **no test**.
- tapsmart "The safest way to redact or censor screenshots on iPhone" (11 Aug 2026, updated 26 Oct 2026, ~330 words): shape at 100% opacity.
- freedom.press field guide: opaque shape, then screenshot the result.
- Adobe "how to redact PDF iPhone"; idownloadblog; nutrient iOS SDK docs; arhfoundation "see writing on pictures covered by drawings".
- For PDFs: per a search summary, someone can delete a Markup overlay shape on a PDF to reveal the text. **Verify by testing** before stating it.

Sources disagree, and most are old or untested. **An original, dated test on current iOS wins this query.**

## Title
- **Recommended:** Is iPhone Markup Safe for Redaction? We Tested It
- **Alt 1:** Can iPhone Markup Be Removed? What Shows Through (Tested)
- **Alt 2:** iPhone Markup Redaction: Which Tools Hide Text (Tested)

**Meta description:** We tested every iPhone Markup tool on a screenshot. The marker and highlighter can be undone with a brightness slider. Here's what actually hides text.

## H1
Is iPhone Markup safe for redacting screenshots? Our test

## Direct answer (40–60 words)
> Partly. In our test on iOS <version>, the highlighter and the default marker let text show through once we raised brightness and contrast. A filled shape or the pen at full opacity hid it, because Markup saves a flattened image. In PDFs, Markup shapes can stay editable. For sensitive numbers, use a solid box tool and check the saved copy.

*(Writer: finalize this answer after the test. Keep it within 40–60 words and change the claims to match the results.)*

## Outline
- **H2: What we tested** iOS version, iPhone model, date. Sample: a fake card number and IBAN in black text on white, plus white text on dark mode. Tools: Pen, Marker, Highlighter, Pencil, each at default and maximum opacity (tap the tool twice), plus a filled square shape. Check: open the saved image in Photos → Edit → Exposure/Brilliance/Contrast max, and in a desktop editor with Levels.
- **H2: Results** A table: tool × opacity × "readable after adjustment?" with thumbnails.
- **H2: Why the highlighter and marker leak** Semi-transparent strokes: dark text stays darker under a dark stroke, so stretching contrast separates it.
- **H2: Can someone undo Markup on a photo I sent?** Test it: after saving, are strokes baked in? (Expected yes for photos, as Markup re-saves the image.) In Photos, "Revert" restores the original **on your device**, but the recipient only gets what you sent. For PDFs, test whether shapes stay as annotations.
- **H2: The safe way with built-in tools** Filled shape at 100% opacity → Done → take a screenshot of the edited image (FPF's tip, which also drops original metadata) → send that.
- **H2: The faster way: RedactPal in Safari** Auto-detects numbers and keys, uses solid boxes, re-encodes without EXIF, no app (CTA).
- **H2: FAQ**
  - I already sent a scribbled screenshot. What now? (if it showed a password or key, change it; for card numbers, contact the bank)
  - Does cropping on iPhone remove the hidden part? (test it: iOS crop re-saves; mention acropalypse on Pixel/Windows as why we test)
  - Is blur from third-party apps safe? (link the blur guide)
  - Does Markup remove location data? (test: share options → "Options" → Location toggle; verify on the device)

## Facts to include (verified)
- 9to5Mac, 13 Mar 2018: "the marker is actually slightly transparent". "you only need to take the picture into a photo editor and lighten the image". The pen "does draw truly opaque strokes". A filled Square shape is the workaround. https://9to5mac.com/2018/03/13/ios-markup-reveal-redact-sensitive-info/
- Apple Support "Use Markup on your iPhone, iPad, or iPod touch" (25 Mar 2026): "Tap the same tool again to change the color opacity." https://support.apple.com/en-us/119875
- TapSmart (updated 26 Oct 2026): drawing tools "are partially transparent, even when layered up". Use a shape at opacity 100. https://www.tapsmart.com/tips-and-tricks/redacting-personal-data/
- FPF: "a fully opaque shape is more effective than the marker tools, which are not fully opaque". Take a screenshot of the redacted image before sharing. https://freedom.press/training/redacting-photos-on-the-go/
- Acropalypse context (Pixel Markup and Windows Snipping Tool left cropped data in saved files, March 2023): https://www.bleepingcomputer.com/news/microsoft/windows-11-snipping-tool-privacy-bug-exposes-cropped-image-content/

## RedactPal demo / test to show
Covered above. Also show the same screenshot in RedactPal on iPhone Safari: auto-boxed card/IBAN → Share.

## Internal links
`/redact-on-iphone-android` (primary CTA) · `/redact-screenshot` · `/guides/can-blurred-text-be-unblurred` · `/`

## Target length
1,200–1,600 words plus the results table and 6–8 test images.

## What competitors miss
- A dated, versioned test on current iOS with before/after images.
- The opacity control (tap the tool twice) that Apple documents but nobody tests.
- The difference between photos (flattened) and PDFs (annotations).

## Avoid
- Publishing the direct answer before running the test.
- Saying "Apple's Markup is insecure" generally. Be tool-specific.
- Using real personal data in test images.
