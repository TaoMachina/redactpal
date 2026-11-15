# Brief: /redact-screenshot (landing page, wave 1 #1)

## Target queries
- **Primary:** redact screenshot
- **Secondary:** redact screenshot online free · black out text in screenshot · hide sensitive info in screenshot · how to censor a screenshot · screenshot redaction tool · blur vs redact screenshot

## Search intent
Transactional plus how-to. The searcher has a screenshot open and wants it safe to send now. Secondary worry: "is blur enough?" and "does the tool upload my image?"

## SERP snapshot (2026-11-15)
| Result | Title pattern | Notes |
|---|---|---|
| picssizer.pages.dev/redact-image | "Redact Image Online Free: Black Out Text & Faces \| PicsSizer" | ~1,200 words. Manual boxes only ("doesn't find text for you"). Claims local processing. 6-question FAQ. Long footer link farm. |
| redact.dev/tools/screenshot-redactor | "Screenshot Redactor". Meta: "Black out names, numbers and faces in a screenshot. The free tool runs in your browser with no upload." | ~600 words. 3 steps plus a 7-question FAQ with FAQPage schema. Offers black out **and** blur/pixelate. No date or author. |
| screenhance.com/blog/how-to-blur-a-screenshot | H1 "How to Blur Part of a Screenshot (and When to Redact Instead)" | 2 Jul 2026, "Screenhance Team". Says weak blurs "have been reconstructed by researchers" but **cites no source**. Blur-first product. |
| lock.pub/en/blog/redact-screenshot-before-sharing | "How to Redact Screenshots Before Sharing Them \| LOCK.PUB" | 20 Jun 2026, ~750 words. H2s by context (support tickets, AI tools, work chats, iPhone, Android, Mac/Windows), a checklist and a table. **No external sources.** |
| gallery.selfboot.cn, supademo, scribe, evernote, App Store apps | Tool pages | Blur/mosaic first. Scribe requires an account (per search snippet). |

Patterns: "Online Free", "Black Out", a colon or pipe and the brand. Pages are short (600–1,200 words), FAQ-heavy, and rarely cite evidence or test anything. **No ranking page auto-detects API keys, card numbers or IBANs.**

## Title
- **Recommended:** Redact a Screenshot Free – Auto-Detects Keys & Cards
- **Alt 1:** Redact Screenshots Online Free – Nothing Is Uploaded
- **Alt 2:** Black Out Text in a Screenshot – Free, No Upload

**Meta description:** Paste a screenshot and RedactPal boxes emails, phone numbers, card numbers and API keys automatically. Free, open source, nothing is uploaded.

## H1
Redact a screenshot in seconds: free, private, nothing uploaded

## Direct answer (40–60 words)
> To redact a screenshot, paste it into RedactPal (Ctrl+V / ⌘V). It finds emails, phone numbers, card numbers, IBANs and API keys on your device and covers them with solid black boxes. Drag over anything else, such as a name, then copy or share the result. Nothing is uploaded, and blur is never used.

## Outline
- **[Tool embed + 4 steps]** Paste or drop → check highlights → drag to add → Copy / Share
- **H2: What does RedactPal hide automatically?** A table of the detected types with examples (fake values): email, phone, card (Luhn-checked), IBAN (checksum), US SSN, IP/MAC, password/secret assignments, JWT, `Authorization` headers, URLs with credentials, provider keys (AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, Google, SendGrid, npm, Hugging Face, Twilio, Discord).
  - H3: Names and addresses: drag once, hide everywhere
- **H2: Why solid boxes and not blur?** Two sentences plus a link to the blur guide. Cite PoPETs 2016 and Bishop Fox.
- **H2: Is my screenshot uploaded?** No. OCR (Tesseract) runs in the browser, the CSP blocks other servers, and it works offline. Link the repo.
- **H2: What is left in the file after redaction?** PNG re-encoded from pixels, no EXIF/GPS, nothing of the original under the boxes. Mention the acropalypse lesson in one line: some editors left cropped data in the saved file (link BleepingComputer).
- **H2: What to check before you send any screenshot** A short checklist: tabs and bookmarks, notification banners, email in the profile corner, URL bar tokens, the clock and battery (FPF advice), a QR code.
- **H2: Redact screenshots on phone, Windows or Mac** Link out to `/redact-on-iphone-android`, the Snipping Tool guide and the iPhone Markup guide.
- **H2: FAQ**
  - Can someone remove the black box?
  - Is blurring a screenshot safe?
  - Does it work offline?
  - Can I redact several screenshots in a row?
  - Does it work for screenshots of chats (WhatsApp, Slack)?
  - Is it really free? (yes, MIT, no account, no limits)

## Facts to include (verified)
- Mosaicing and blurring "are not viable approaches for text redaction". Hill, Zhou, Saul, Shacham, PoPETs 2016: https://petsymposium.org/popets/2016/popets-2016-0047.php
- Bishop Fox (Dan Petro, 15 Feb 2022) recovered pixelated text and concludes "the only way to do it securely is to use black bars": https://bishopfox.com/blog/unredacter-tool-never-pixelation
- In March 2023, Windows 11 Snipping Tool was shown to leave cropped data in a file when saving over the original ("acropalypse"). BleepingComputer, 21 Mar 2023: https://www.bleepingcomputer.com/news/microsoft/windows-11-snipping-tool-privacy-bug-exposes-cropped-image-content/
- FPF advises cropping out the clock, signal indicator and app buttons before sharing: https://freedom.press/training/redacting-photos-on-the-go/
- RedactPal behavior: README and llms.txt in the repo (detected types, PNG re-encode, CSP).

## RedactPal demo / test to show
1. Build a fake "dev dashboard" screenshot containing `sk-proj-…` (fake), `AKIA…EXAMPLE` (AWS's documented example key), an email, a Luhn-valid test card `4242 4242 4242 4242`, and a name.
2. Screen 1: the paste, with auto-highlights (all except the name).
3. Screen 2: drag over the name, then the "hide everywhere" prompt.
4. Screen 3: the exported PNG, plus `exiftool` output showing no EXIF/GPS.
5. Optional: a DevTools Network tab showing zero requests during processing (proves "no upload").

## Internal links
- Tool: `/` (CTA) · `/hide-api-keys-in-screenshots` · `/redact-image` · `/redact-on-iphone-android`
- Guides: `/guides/can-blurred-text-be-unblurred` · `/guides/snipping-tool-quick-redact-limits` · `/guides/iphone-markup-redaction-safe` · `/guides/is-it-safe-to-share-screenshots-with-chatgpt`

## Target length
800–1,100 words. The tool comes first; text and FAQ go below.

## What competitors miss (we must cover)
- Auto-detection of secrets and financial numbers. Every ranking tool is manual or blur-based.
- Evidence for "blur is reversible". Screenhance asserts it without a source. We cite the papers.
- Proof of "no upload": a network tab screenshot plus a CSP link. Others just say "never uploaded".
- What survives in the file: EXIF and leftover cropped data.

## Avoid
- "100% secure", "AI-powered" (detection is rule-based), "undetectable".
- Implying names are auto-detected. Show the drag-once flow instead.
- Unsourced claims about rivals' uploads. redact.dev and picssizer both say they process locally, so don't contradict them.
