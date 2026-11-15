# Brief: /redact-image (landing page, wave 2 #7)

## Target queries
- **Primary:** redact image
- **Secondary:** redact image online · black out part of a photo · censor ID card photo · redact photo of document · remove EXIF/GPS before sharing photo · redact picture free

## Search intent
Transactional. Unlike `/redact-screenshot`, the image is usually a **camera photo**: an ID card, a letter, a document on a desk, a receipt or a parcel label. Extra worries are location metadata and faces.

**Cannibalization rule:** this page focuses on photos, documents, IDs and metadata. Screenshots, UI and keys belong to `/redact-screenshot`. Cross-link between them; don't duplicate.

## SERP snapshot (2026-11-15)
- picssizer.pages.dev/redact-image: H1 "Redact Images Online Free: Black Out Text & Faces". ~1,200 words, manual boxes, says GPS/camera data is not copied to the export.
- gallery.selfboot.cn: "Free Online Image Blur and Redaction Tool" (mosaic, blur, black and white boxes).
- trupeer.ai "AI Image Blur & Redaction Tool"; caseguard (enterprise AI); evernote; pixa; arovat.pages.dev; itkb-web.pages.dev ("Censor ID Cards & Blur Faces").
- Docs-type results: GroupDocs image redactions, Syncfusion image editor (developer intent).

Patterns: "Online Free", "Black Out Text & Faces", "Blur". Many tools default to blur.

## Title
- **Recommended:** Redact an Image Free – Black Out Text, Strip GPS Data
- **Alt 1:** Redact a Photo of a Document or ID – Free, No Upload
- **Alt 2:** Black Out Part of a Photo Free – Nothing Uploaded

**Meta description:** Black out text in a photo of an ID, letter or receipt. Numbers are found automatically and the saved PNG has no EXIF or GPS. Free, nothing uploaded.

## H1
Redact an image or photo: solid boxes, no location data, no upload

## Direct answer (40–60 words)
> Open the photo in RedactPal. It reads the text on your device, boxes card numbers, IBANs, emails and phone numbers, and lets you drag over names, faces or anything else. The saved copy is a new PNG built from pixels, so it carries no EXIF or GPS location and nothing remains under the boxes. Free, no upload.

## Outline
- **[Tool + 3 steps]**
- **H2: What photos people redact most** ID cards and passports (cover the number, MRZ lines, photo and signature), letters and envelopes (address), receipts (card digits), parcel labels (barcode and name), whiteboards.
- **H2: Does a photo reveal where it was taken?** EXIF/GPS explained in 3 sentences; the RedactPal output has none. FPF also suggests sharing a screenshot of the edited image to avoid the original's metadata.
- **H2: Faces and signatures** Drag a box; never blur faces. Cite PoPETs 2016 (text) and Bishop Fox. Face-specific deblurring research: only cite after the writer verifies a primary paper.
- **H2: Black box vs blur vs crop** A 3-row table. Crop: safest at the edges, useless in the middle. Box: safe if opaque and flattened. Blur/pixelate: reversible.
- **H2: Photos with small or angled text** Practical capture tips: shoot flat, fill the frame, good light. OCR reads straight text best. Drag over anything the highlights don't cover.
- **H2: FAQ**
  - Can someone remove the black box from my photo? (no: the pixels are replaced in a new PNG)
  - Which formats can I open? (test: JPG, PNG, HEIC on iPhone Safari?, WebP)
  - Does the output keep the original quality?
  - Is the original photo changed? (no, a new copy is made)
  - Can I redact on my phone? (link `/redact-on-iphone-android`)

## Facts to include (verified)
- FPF, "Redacting photos on the go" (David Huerta, 3 Jun 2020, updated 12 Jun 2026): "the best thing to do is avoid sharing the original photo". Screenshots copy only what's displayed. Some Android phones add metadata to screenshots. https://freedom.press/training/redacting-photos-on-the-go/
- Blur/mosaic not viable for text: PoPETs 2016 https://petsymposium.org/popets/2016/popets-2016-0047.php
- picssizer says its download doesn't copy camera details or GPS (their page). Don't present this as a RedactPal-only advantage.

## RedactPal demo / test to show
1. Photo of a **specimen** ID card (use a government-published specimen image, check its license, or make a fake card) plus a fake letter with an address.
2. Show auto-detected numbers, a manual box over the face, and the address via "hide everywhere".
3. `exiftool` on the original (GPS present) vs the export (no EXIF). Use a test photo taken with location on.
4. Test and report HEIC support on iPhone Safari and the conversion behavior.

## Internal links
`/` (CTA) · `/redact-screenshot` · `/redact-on-iphone-android` · `/guides/can-blurred-text-be-unblurred`

## Target length
700–900 words.

## What competitors miss
- Auto-detection of numbers in photos.
- A clear statement of what metadata is in the output (none) and why.
- Capture tips that improve automatic detection.

## Avoid
- "Detects faces". It doesn't. Faces are a manual drag.
- Using a real person's ID or anyone's real face in demos.
- Unverified face-deblurring accuracy statistics (several blogs quote "95.9%" or "96%" without a primary link).
