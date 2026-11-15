# Brief: /guides/can-blurred-text-be-unblurred (guide, wave 1 #1)

## Target queries
- **Primary:** can blurred text be unblurred
- **Secondary:** can pixelated text be recovered · is blurring text safe · unpixelate text · depixelate screenshot · is blur safe for redaction · can AI unblur text · blur vs black box

## Search intent
Mixed, and that's the opportunity. Half the SERP serves people who **want** to unblur text (tool pages); the other half worries whether **their** blurred screenshot is safe. We serve the second group with the authoritative answer and capture the first group's curiosity with the research.

## SERP snapshot (2026-11-15)
- "Unblur" tool and tutorial pages dominate: flexclip, Wondershare drfone, Picsart, CyberLink, Adobe Express "text in image", fotor ("how to unblur text", now 410 Gone), beautyplus, ezenhancer "How to Unblur Text in Images & Screenshots (2026 Guide)", shapes.inc FAQ. They focus on sharpening mildly blurry photos. Several admit "deliberately blurred" text can't be restored, which contradicts the research for the known-font case.
- jameshfisher.com "When in doubt, don't blur it out" (29 Feb 2020): a 1-D blur inversion demo.
- An OU.nl BSc thesis (2014) on blurred-letter comparison.
- VideoHelp forum threads.

Patterns: "How to Unblur Text (2026 Guide)", "[Solved]", "3 Easy Ways". **No ranking page gives a clear, sourced yes/no for redaction safety.**

## Title
- **Recommended:** Can Blurred Text Be Unblurred? Often, Yes – Here's Proof
- **Alt 1:** Can Pixelated Text Be Recovered? What Research Shows
- **Alt 2:** Is Blurring Text Safe? Why Researchers Say No

**Meta description:** Researchers have recovered blurred and pixelated text in screenshots when the font is known. See the evidence, and what to use instead: solid boxes.

## H1
Can blurred or pixelated text be unblurred?

## Direct answer (40–60 words)
> Often, yes. Blur and pixelation keep a trace of every letter, and when the font and size are known, which is typical for screenshots, researchers have recovered the hidden text. A 2016 study called mosaicing and blurring "not viable" for redaction. To hide text for good, cover it with a solid opaque box and save a flattened copy.

## Outline
- **H2: Why blur and pixelation leak information** Each block or blurred pixel is an average of the original. Averages of known fonts can be matched. Add a simple diagram.
- **H2: What the research shows** A timeline table:
  - 2016: Hill, Zhou, Saul, Shacham (PoPETs) used hidden Markov models; "not viable approaches for text redaction".
  - 2020: James Fisher demo shows blur "can be completely inverted" in a simple model.
  - Feb 2022: Bishop Fox Unredacter (Dan Petro) recovers pixelated text from the Jumpsec challenge; needs font, size and that it's text.
  - Jan 2022: Positive Security recovers a pixelated IBAN from **video** by combining frames.
  - Depix: PoC for pixelized screenshots (archived on GitHub 14 Apr 2026, moved to Codeberg).
- **H2: Can AI "unblur" text?** AI upscalers invent plausible detail. Positive Security found Topaz, VideoEnhancer, MFSR and TecoGAN gave no readable result, while frame alignment did. So AI output isn't proof either way, and matching attacks are the real risk.
- **H2: When is blurred text actually safe?** Honest nuance: heavy blur on unknown fonts with long, unpredictable strings is much harder. Short items (PINs, card digits, names from a known list) are the riskiest. The rule: don't bet secrets on it.
- **H2: Blur vs pixelate vs black box vs crop** A table: reversible? · reveals length? · best for.
- **H2: Built-in tools that blur by default** Google Photos Redact pen (blur/pixelate, Sep 2026); many screenshot editors. Name them factually.
- **H2: How to hide text so it can't be recovered** Solid box → flatten/re-encode → check. RedactPal does all three (CTA).
- **H2: FAQ**
  - Can someone unblur a screenshot I posted?
  - Is a black box safe? (yes, if opaque and flattened; in PDFs make sure the text underneath is removed)
  - Does pixelating with bigger blocks help?
  - Is a blurred face recoverable? (verify a primary face-deblurring paper before answering with numbers)
  - What should I do if I already posted a blurred password or key? (rotate it; link the leaked-key guide)

## Facts to include (verified)
- Hill et al., "On the (In)effectiveness of Mosaicing and Blurring as Tools for Document Redaction", PoPETs 2016(4), 403–417: "We conclude that mosaicing and blurring, despite their widespread usage, are not viable approaches for text redaction." https://petsymposium.org/popets/2016/popets-2016-0047.php
- Bishop Fox, Dan Petro, 15 Feb 2022. Assumptions: the font type, the font size, and that it's text. "the only way to do it securely is to use black bars." https://bishopfox.com/blog/unredacter-tool-never-pixelation · repo https://github.com/BishopFox/unredacter (8.4k stars on 2026-11-15)
- Positive Security, Fabian Bräunlein, 25 Jan 2022: pixelated IBAN in phone video made "fairly readable" by stabilizing and overlaying frames. AI upscalers failed. "use an opaque, single-colored box". https://positive.security/blog/video-depixelation
- James Fisher, 29 Feb 2020: "counterintuitively, blur can be completely inverted to recover the original image!" https://jameshfisher.com/2020/02/29/when-in-doubt-dont-blur-it-out/
- Depix: "a PoC for a technique to recover plaintext from pixelized screenshots"; GitHub archived 14 Apr 2026. https://github.com/spipm/Depix
- Google Photos Redact pen blurs/pixelates: https://9to5google.com/2026/09/24/google-photos-redact-moods/

## RedactPal demo / test to show (original evidence)
1. Create a screenshot of a fake 16-digit card number in a known system font. Make 3 versions: Gaussian blur (light), pixelate 8px, RedactPal box.
2. Optional (time permitting): run Unredacter or Depix against our own pixelated sample, following each tool's documented setup, and publish the outcome either way with the exact settings.
3. Always show the RedactPal export: pixel inspection shows uniform black; the file is re-encoded.

## Internal links
`/redact-screenshot` (primary CTA) · `/` · `/hide-api-keys-in-screenshots` · `/guides/iphone-markup-redaction-safe` · `/guides/api-key-leaked-in-screenshot-what-to-do`

## Target length
1,400–1,800 words.

## What competitors miss
- A sourced answer from the privacy side. Unblur-tool pages say "deliberate blur can't be restored", which the research contradicts for known fonts.
- The video multi-frame attack.
- Today's default tools that still blur (Google Photos Redact).

## Avoid
- Over-claiming: don't say "any blur can be reversed instantly". Say "often, especially for screenshots with known fonts".
- Teaching step-by-step deanonymization of other people's content. Describe the methods at a high level and link the research.
- Unsourced accuracy percentages ("96%") seen on vendor blogs.
