# Brief: /redact-on-iphone-android (landing page, wave 2 #3)

## Target queries
- **Primary:** how to redact a screenshot on iPhone / Android
- **Secondary:** redact photo iPhone · black out text iPhone screenshot · redact screenshot Android · Google Photos redact · hide info in screenshot before sending WhatsApp · redact PDF on iPhone free

## Search intent
How-to plus tool. They're on the phone right now with a screenshot of a chat, bank app or ticket. They want to know whether the built-in editor is safe, or which free option to use without installing an app.

## SERP snapshot (2026-11-15)
- freedom.press "Redacting photos on the go: A field guide" (David Huerta, 2020, updated 12 Jun 2026). Use a fully opaque shape on iPhone; on Android, Markup Pen, "over at least twice"; screenshot the result to drop metadata.
- ioshacker "How To Properly Redact Sensitive Information On iPhone Or iPad" (Zaib Ali, 4 Mar 2023). Says full-density pencil or a filled shape is fine; no test shown.
- tapsmart "The safest way to redact or censor screenshots on iPhone" (Tom Rolfe, 11 Aug 2026, updated 26 Oct 2026, ~330 words). Shape at 100% opacity.
- App Store apps (Redacter, Redact Screenshot – Blur Text, Blackout, Black Out); goldenkani.onrender.com; iphonelife (crop).
- Android: Tom's Guide and 9to5Google on the new **Google Photos Redact pen (blur/pixelate)**, rolling out globally on Android (9to5Google, 24 Sep 2026).

Patterns: "How to … on iPhone", "The safest way", "Properly". All are single-platform, and none mentions that Google's new tool uses reversible effects.

## Title
- **Recommended:** Redact Screenshots on iPhone & Android – No App Needed
- **Alt 1:** How to Redact a Screenshot on iPhone or Android (Safely)
- **Alt 2:** Black Out Text on Your Phone – Free, No App, No Upload

**Meta description:** Black out info in a phone screenshot or PDF from Safari or Chrome. No app to install, numbers and keys found automatically, nothing uploaded.

## H1
Redact screenshots and PDFs on iPhone and Android, with no app to install

## Direct answer (40–60 words)
> Open redactpal.com in Safari or Chrome, tap **Choose a photo or file** and pick the screenshot. Card numbers, emails, phone numbers and keys are boxed automatically, and you drag a finger over anything else. Tap **Share** to send the safe copy straight to WhatsApp, Messages or Mail. Nothing is uploaded, and it works offline once opened.

## Outline
- **[Steps with phone screenshots]**
- **H2: Is the built-in Markup or Google Photos editor safe?**
  - H3: iPhone Markup: marker/highlighter are see-through (9to5Mac 2018); a filled shape at full opacity works if you then flatten by screenshotting. Link the iPhone Markup guide for our test.
  - H3: Google Photos Redact pen: it **blurs or pixelates** (9to5Google). Researchers have recovered pixelated text (Bishop Fox), so for numbers and passwords use a solid box.
  - H3: Samsung/other gallery editors: test one model and report it, or leave this out.
- **H2: Install RedactPal on your home screen** iPhone: Share → Add to Home Screen. Android: Install app, after which RedactPal appears in the share sheet (Share → RedactPal from Gallery).
- **H2: Redact a PDF on your phone** Same flow; the result is a new PDF.
- **H2: Before you share: crop the status bar** FPF tip: clock, signal and app buttons.
- **H2: FAQ**
  - Do I need to install anything? (no)
  - Does it work offline on a phone? (yes, after the first visit)
  - Does it remove photo location data? (yes, a new PNG)
  - Can I share directly to WhatsApp? (Share button)
  - Is it free on iPhone? (yes, no in-app purchases)

## Facts to include (verified)
- 9to5Mac, Benjamin Mayo, 13 Mar 2018 ("PSA: iOS Markup is not designed to be a redaction tool…"): the Markup marker "is actually slightly transparent", and lightening the image reveals text. The pen draws opaque strokes. A filled square shape is not affected. https://9to5mac.com/2018/03/13/ios-markup-reveal-redact-sensitive-info/
- Apple Markup support (25 Mar 2026): "Tap the same tool again to change the color opacity". Shapes can be added and resized. https://support.apple.com/en-us/119875
- 9to5Google, Abner Li, 24 Sep 2026: "a Redact pen that lets you blur/pixelate sensitive info in screenshots and images", rolling out globally to Google Photos for Android. https://9to5google.com/2026/09/24/google-photos-redact-moods/
- Bishop Fox on pixelation: https://bishopfox.com/blog/unredacter-tool-never-pixelation
- FPF field guide: https://freedom.press/training/redacting-photos-on-the-go/
- RedactPal install and share-target behavior: README "On your phone" and "Install it".

## RedactPal demo / test to show
1. iPhone (state the iOS version) plus Android (Pixel or Samsung, state the version): a fake chat screenshot with a phone number and an IBAN.
2. Screens: file picker → auto-boxes → finger-drag → Share sheet → WhatsApp.
3. Android only: Gallery → Share → RedactPal (installed PWA share target).
4. Side-by-side: Google Photos Redact (pixelate) output vs RedactPal box. Optionally show that the pixelated result at low block size still hints at digit shapes. Don't claim we "recovered" it unless we actually did.

## Internal links
`/` (CTA) · `/guides/iphone-markup-redaction-safe` · `/redact-screenshot` · `/redact-pdf` · `/guides/can-blurred-text-be-unblurred`

## Target length
900–1,200 words. Heavy on phone screenshots.

## What competitors miss
- One page for both platforms, with a browser tool and no install.
- Google Photos' new Redact pen is blur/pixelate, so it's unsuitable for numbers and passwords.
- The share-sheet workflow (PWA share target on Android).

## Avoid
- Saying Google's tool is "insecure" as a blanket claim. Say what it does (blur/pixelate) and what research shows about those effects.
- Claiming iOS share-sheet integration. The README describes the share target only on Android.
