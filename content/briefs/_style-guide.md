# RedactPal content style guide

Applies to every landing page (`/redact-…`, `/compare`, …) and every guide (`/guides/<slug>`).
Research basis: SERP review of all 19 target queries, 2026-11-15 (see each brief's "SERP snapshot").

---

## 1. Positioning: lead with it, every page

RedactPal is **free, fully open source (MIT), needs no account and never uploads your file**. It runs in the browser, works offline and installs as an app. Say this first, before any how-to. On landing pages it belongs in the H1 area and the first sentence; in guides it belongs in the first mention of RedactPal.

The four facts we can state flatly, because the code proves them (link the repo when you state them):

| Claim | Proof to link |
|---|---|
| Nothing is uploaded; no third-party requests | `vercel.json` / `public/_headers` CSP (`connect-src 'self' blob: data:`), README "Why you can trust it" |
| Solid boxes only, never blur or pixelation | README, ARCHITECTURE.md principle 2 |
| Images re-encoded as PNG, no EXIF/GPS | README "Rebuilt from pixels" |
| PDFs rebuilt page by page from pixels; metadata dropped | README, `src/pdf/flatten.ts` |

Repo: https://github.com/stefano2007517-star/redactpal

## 2. Voice

- **Confident and plain.** Say what happens: "RedactPal finds the key and covers it with a solid box." Not "RedactPal may help you try to…".
- **Second person, short sentences, active verbs.** Average 15 words per sentence or fewer.
- **Specific over general.** Name the app version, the menu item, the key prefix (`sk-proj-`, `ghp_`, `AKIA`). Give numbers when we have them.
- **No hedging filler.** Cut "it's worth noting", "arguably", "in today's digital world", "we're just a small project". Cut throat-clearing intros. The first sentence under the H1 is the answer.
- **Non-defensive.** Do not open with or dwell on what RedactPal can't do. See section 6 for how to state a limitation when the reader needs it.
- **Neutral on news events.** Describe what happened technically and who said what, with sources. No political adjectives (one source we cite calls officials "fools". We never write like that).
- **International English.** Use US spelling, avoid US-only idioms, and write "phone number", not "cell". Give both shortcuts: Ctrl+V / ⌘V.

## 3. Titles (`<title>`)

Google sets no character limit but truncates title links to fit the device width, and warns against verbose, repetitive or boilerplate titles (https://developers.google.com/search/docs/appearance/title-link). Our rules:

1. **≤ 60 characters.** Every brief's titles are checked against this.
2. **Primary keyword in the first 3–4 words**, in the searcher's own phrasing ("Redact a Screenshot", "Can Blurred Text Be Unblurred").
3. **One specific promise** after a separator (an en dash or colon): what makes this page the answer. Examples: "No Upload", "Solid Boxes", "Tested", "What to Do Now".
4. **No brand suffix on guides when space is tight.** Google often appends the site name itself. Landing pages may end in "| RedactPal" if it fits.
5. **Year only where freshness is the point**: comparisons and "best" lists ("(2026)"), and pages about current app versions. Never on evergreen how-tos; show freshness with a visible "Last tested" date instead.
6. **One parenthetical at most.** Competitors stack "(Free)", "[It's Free and Online]", "(Privacy-First)". Pick one. "(Tested)" or "(N Tools Tested)" is the strongest because it promises evidence.
7. **No clickbait.** No "You won't believe", no all-caps, no emoji, no "Ultimate".

### Title formulas, with examples

| Page type | Formula | Example |
|---|---|---|
| Tool landing | `[Verb] [Object] Free – [Differentiator]` | Redact Screenshots Free – Nothing Uploaded |
| Tool landing, device | `[Verb] [Object] on [Device] – [Differentiator]` | Redact Screenshots on iPhone & Android – No App |
| Yes/no question guide | `[Exact question]? [Short answer + proof]` | Can Blurred Text Be Unblurred? Yes – Here's How |
| Is-it-safe guide | `Is It Safe to [Action]? [What to hide first]` | Is It Safe to Send a Bank Statement Screenshot? |
| How-to guide | `How to [Task] ([Qualifier])` | How to Check If a PDF Redaction Worked (4 Tests) |
| Incident / explainer | `Why [Thing] Fails: [Case] & [Lesson]` | Why PDF Redactions Fail: Lessons From Real Leaks |
| Comparison | `Best Free [Category] ([N] Tested, [Year])` | Best Free Redaction Tools (8 Tested, 2026) |
| Brand vs | `RedactPal vs [Rival]: [Dimension]` | RedactPal vs Snipping Tool: What Each Hides |

## 4. Meta descriptions

- **≤ 155 characters**, one or two sentences, with the primary keyword once.
- Structure: **what you get + how + proof/trust signal**. Example: "Black out emails, card numbers and API keys in a screenshot. Free, open source, runs in your browser – nothing is uploaded."
- Include one concrete differentiator a competitor can't claim (auto-detects API keys, no account, MIT open source, works offline).
- No quotes around the keyword, no "Click here", no ellipsis.

## 5. Page structure (every page)

1. **One H1.** Close to the title but it doesn't have to be identical. It may be longer and more natural.
2. **Direct answer, 40–60 words, right under the H1.** Plain sentences, no bullet list. It must work on its own as a featured snippet or an AI-answer citation: it states the answer, the key reason, and the action. The brief gives a draft; keep it within 40–60 words.
3. **Trust line** under the answer: `Last tested: <date> · <app/OS versions> · By <author>`. Use real versions from the test session.
4. **Do-it-now block** (landing pages): a 3–4-step numbered list plus the tool CTA, above the fold.
5. **H2s phrased as the questions people ask.** These mirror People-Also-Ask-style questions. Note: our question lists come from competitor FAQ sections and related-search phrasing gathered on 2026-11-15, not from a scraped Google PAA box. Before writing, check the live SERP in an incognito window and swap in any PAA questions you see.
6. **Evidence section**: "What we tested" or "How we checked", with our own screenshots, the file we used, the tool version and the result.
7. **FAQ (4–6 questions)** at the end, with short answers of 2–4 sentences. Use FAQPage JSON-LD for AI/LLM parsing only. Google has shown FAQ rich results only for "well-known, authoritative government and health websites" since August 2023, and HowTo rich results are deprecated (https://developers.google.com/search/blog/2023/08/howto-faq-changes). Don't promise rich snippets to anyone.
8. **Related links block**: one landing page, the tool, and 2–3 sibling guides.

Formatting rules:
- Numbered lists for steps, at most 7 steps per list, with one action per step and the UI label in **bold**.
- Use tables for any comparison of 3+ items on 3+ dimensions.
- Every screenshot has descriptive alt text, a caption saying what it proves, and the version tested. Redact our own test data in our screenshots with RedactPal, and say so in the caption.
- Use code formatting for key prefixes, commands and file names.
- Paragraphs are no longer than 4 lines on desktop.
- No walls of keyword-stuffed text at the bottom of the page. Several competitors (picssizer, lock.pub) append long "Keywords" or link farms. We don't.

## 6. Limitations: when and how to state them

State a limitation **only where the reader needs it to get a correct result**, in the step where it applies, framed as a fact about how the tool works:

| Situation | Say this | Not this |
|---|---|---|
| PDF export | "The exported PDF is rebuilt from pixels, so hidden text is gone for good. If the recipient needs to search or copy the text, run OCR on the redacted copy." | "Unfortunately, our PDFs aren't selectable." |
| Names / addresses | "Drag a box over a name once and RedactPal offers to hide it everywhere it appears." | "We can't detect names." |
| Review step | "Check the highlights before you copy. Detection covers formats like emails, cards and keys, and you add anything else with one drag." | "Detection can miss things, so be careful." |
| Box size | (Only on PDF-forensics pages) "A box shows how wide the hidden text was. For short names, cover the whole line or field." | Omit entirely on tool pages |

Never claim "100% secure", "undetectable", "military-grade", "AI-powered" (detection is rule-based: formats, checksums, key prefixes), or "GDPR/HIPAA compliant" (a tool can't be compliant. An organization's process is).

## 7. Claims about competitors

- **Accurate, sourced and dated.** Every statement about another tool (price, limits, upload behavior, features) links to that tool's own page or a primary test, with "as of <date>".
- **Prefer our own test** over a third-party claim. If we didn't test it, say "according to <vendor>'s page".
- **No invented weaknesses.** If a rival processes locally (redact.dev, picssizer and Elephas all say so), we say so.
- Compare on the dimensions where we genuinely win: **price (free, no limits), no upload, open source, no account, auto-detection of keys/cards/IBANs, solid boxes vs reversible blur, works offline, self-hostable.**
- Comparison pages **recommend RedactPal** for the jobs it's built for and carry a one-line disclosure: "We make RedactPal. We tested every tool with the same files and link our evidence." That's a trust signal, not a hedge.

## 8. E-E-A-T checklist (every page)

- [ ] Named author with a short bio and a link to the GitHub profile/repo. Guides that rely on a test also name the tester.
- [ ] "Last tested" date plus OS/app versions. Re-test pages about Apple/Google/Microsoft apps every 6 months.
- [ ] Primary sources first: the paper, the vendor's own help page, the CVE, the original reporting. Use secondary blogs only for context, and label them.
- [ ] Our own evidence: before/after screenshots, the test file (downloadable sample with fake data), and the exact check performed (select-all, copy-paste, `pdftotext`, brightness slider).
- [ ] Link to the exact source file in the repo when describing behavior (for example, `src/detect/rules.ts` for the list of key formats).
- [ ] No stats without a source. Many vendor pages quote unsourced numbers ("96% accuracy", "redaction failures cost $X"). We don't repeat them.
- [ ] Dates on every news/incident fact.

## 9. Internal linking

- Every guide links to **one** landing page as the primary CTA (named in its brief) and to the tool home `/`.
- Every landing page links to its 2–3 supporting guides under "Learn more".
- Use descriptive anchor text with the target's keyword ("redact a PDF without uploading it"), never "click here".
- Hub map:
  - `/redact-screenshot` ← blurred-text, snipping-tool, iphone-markup, chatgpt-screenshots
  - `/redact-pdf` ← why-pdf-redactions-fail, check-pdf-redaction, mac-preview
  - `/redact-bank-statement` ← bank-statement-screenshot
  - `/hide-api-keys-in-screenshots` ← api-key-leaked
  - `/anonymize-text-for-chatgpt` ← chatgpt-screenshots
  - `/redact-on-iphone-android` ← iphone-markup
  - `/compare` ← best-free-redaction-tools-tested, snipping-tool
  - `/self-hosted-redaction` ← compare

## 10. CTA wording

Primary (button): **Open RedactPal – free, no upload**
Contextual (inline, match the page task):
- "Paste your screenshot into RedactPal (Ctrl+V / ⌘V). Keys, emails and card numbers are boxed automatically."
- "Drop the PDF into RedactPal. Every page is rebuilt from pixels, so nothing under a box survives."
- "Paste the text, copy the version with placeholders like `[EMAIL_1]`, and paste the AI's reply back to restore your details."
Secondary: "Read the source on GitHub" (trust), "Install it as an app" (mobile pages).
Don't use "Sign up", "Get started free" (there's nothing to sign up for), or "Try it now!!!".

## 11. Length and freshness

- Landing pages: 700–1,100 words. The tool and steps come first. Most of the length is FAQ and proof.
- Guides: 1,200–2,200 words. Comparisons: 2,000–3,000 words.
- Competitor pages that rank run about 600–3,300 words, so length is not the differentiator. Evidence is.
- Add a visible changelog line at the bottom: "Updated <date>: <what changed>."
