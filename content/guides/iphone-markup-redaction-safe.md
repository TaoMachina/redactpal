---
title: Is iPhone Markup Safe for Redaction? How to Check
description: Markup's marker and highlighter are partly transparent, so text can show through. How to test your own screenshot and which tool to use instead.
h1: Is iPhone Markup safe for redacting screenshots?
published: 2026-11-15
updated: 2026-11-15
draft: false
toc: auto
cta:
  tool: redact-screenshot
  title: Box it out in Safari, no app needed
  text: RedactPal finds card numbers, IBANs, emails and keys in a screenshot and covers them with solid boxes. Free, no account, nothing is uploaded.
  button: Redact a screenshot
howto:
  name: How to hide text on an iPhone screenshot with built-in tools
  description: Use a filled shape at full opacity, then check the result.
  steps:
    - name: Open the screenshot in Markup
      text: Tap the screenshot thumbnail, or open it in Photos and tap Edit, then the Markup button.
    - name: Add a shape
      text: Tap the plus button, choose a square, and make it fill the text completely.
    - name: Make it filled and fully opaque
      text: Set the style to filled, choose black, and set opacity to 100 percent.
    - name: Check, then send a copy
      text: Raise brightness and contrast on a copy to confirm nothing shows, then share that copy.
related:
  - redact-screenshot
  - guides/can-blurred-text-be-unblurred
  - guides/is-it-safe-to-send-bank-statement-screenshot
faq_title: iPhone Markup — questions
faq:
  - q: I already sent a scribbled screenshot. What now?
    a: Look at it with brightness and contrast raised. If anything sensitive shows, treat it as exposed. Change passwords and keys, and for card numbers contact your bank.
  - q: Does cropping on iPhone remove the hidden part?
    a: Don't rely on a crop to delete anything. The 2023 acropalypse bugs, which affected Google Pixel's Markup and the Windows Snipping Tool, left cropped-out pixels inside the saved file. The safe habit is to screenshot the edited result, or use a tool that rebuilds the image from scratch, as RedactPal does.
  - q: Is blur from a third-party app safe?
    a: No blur strength is known to be safe, and pixelation has been reversed by public tools. Use a solid box.
  - q: Does Markup remove location data?
    a: Don't count on it. Freedom of the Press Foundation advises sharing a screenshot of the edited image, which gives a copy without the original photo's metadata. RedactPal re-encodes every export as a fresh PNG with no location data.
---

**It depends on the tool.** Apple's Markup lets you change a stroke's opacity, and 9to5Mac, TapSmart and Freedom of the Press all report that the marker tools are partly transparent. A filled shape at 100% opacity is the recommended fix. Verify any redaction by raising brightness and contrast on a copy before you send it.

We could not test on an iPhone for this guide, so there is no results table here. We cite what others have documented, and below we show you how to run the check yourself in a minute, on your own device and iOS version.

## What others have found

- **9to5Mac, 13 March 2018.** Benjamin Mayo wrote that [the marker is "actually slightly transparent"](https://9to5mac.com/2018/03/13/ios-markup-reveal-redact-sensitive-info/), and that lightening the image in a photo editor can reveal text beneath it, even after a few coats. The pen drew opaque strokes, but its small size makes it awkward. His workaround was a Square shape from the plus menu, changed from outline to filled.
- **TapSmart (updated 26 October 2026).** The [drawing tools are "partially transparent, even when layered up"](https://www.tapsmart.com/tips-and-tricks/redacting-personal-data/). A shape set to 100% opacity that fully covers the text cannot be undone by image adjustments.
- **Freedom of the Press Foundation.** Their guide to [redacting photos on the go](https://freedom.press/training/redacting-photos-on-the-go/) says that on iOS a fully opaque shape is more effective than the marker tools, which are not fully opaque.
- **Apple.** [Apple's Markup guide](https://support.apple.com/en-us/119875) says to tap the same tool again to change the color opacity. It also says you can tap a shape to add it to a screenshot, photo or PDF.

These reports span several years. Apple may have changed how each tool renders, so the test below matters more than any article, including this one.

## Why the marker and highlighter can leak

A semi-transparent stroke does not replace the pixels underneath. It blends with them. Dark text under a dark, partly transparent stroke is still a little darker than the paper around it. Stretch the contrast and that small difference becomes legible. A stroke that is truly opaque replaces the pixels, so there is nothing to stretch.

## Test your own markup in one minute

Do this with a fake number, not a real one.

1. Type a fake card number into Notes and take a screenshot.
2. Cover it with each tool you plan to use: pen, marker, highlighter, and a filled square. Tap a tool twice to see its opacity control.
3. Save the result.
4. Open the saved image in **Photos**, tap **Edit**, and push **Exposure**, **Brilliance** and **Contrast** to their extremes. For a harder test, send the image to a computer and use **Levels** or **Curves** in an image editor.
5. If you can read the number, so can the person you send it to.

If a tool fails at its default setting, raise its opacity to the maximum and run the test again. Apple documents the opacity control but, in the page we read, does not say that the maximum makes a stroke fully opaque, so check rather than assume.

## Photos versus PDFs

For a screenshot or a photo, Markup saves an image, so the recipient gets pixels. For a PDF, Apple says you can add shapes to a PDF in Markup, and a shape added to a PDF can stay a separate annotation that sits on top of the text. Test it: send the marked PDF to a computer, open it in a desktop reader, and try to select and move the shape. If you can, so can the recipient. Then run the checks in [how to check if a PDF redaction worked](/guides/how-to-check-if-pdf-redaction-worked/).

## The safe way with built-in tools

1. Open the screenshot and tap the Markup button.
2. Tap **+**, choose the **square**, and drag it so it covers the whole text with some margin.
3. Set the style to **filled**, choose black, and set opacity to 100%.
4. Tap **Done**, and run the test above on the result.
5. Take a **screenshot of the edited image** and share that. Freedom of the Press Foundation recommends this because the copy no longer carries the original photo's metadata.

Leave margin: the box shows how wide the text was, and a tight box on a short value tells a reader its length.

## The faster way: RedactPal in Safari

[RedactPal](/redact-screenshot/) is free, MIT-licensed and needs no account or app. Open it in Safari, tap **Choose a photo or file**, and pick the screenshot. It highlights card numbers, IBANs, emails, phone numbers and API keys and covers them with solid boxes, with no opacity setting to get wrong. Nothing is uploaded; everything runs on your device. The exported image is re-encoded as a new PNG without EXIF data, and **Share** sends it to your chat or mail app. Detection is rule-based and does not find names, so drag a box over those yourself, and look at the result before you send.

<!-- cta -->

Related reading: [why blur and pixelation can be reversed](/guides/can-blurred-text-be-unblurred/), and [whether it is safe to send a bank statement screenshot](/guides/is-it-safe-to-send-bank-statement-screenshot/). If a key or password has already been exposed, see [what to do after a leak](/guides/api-key-leaked-in-screenshot-what-to-do/).
