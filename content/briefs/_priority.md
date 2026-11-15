# Writing priority: first wave (4 landing pages + 6 guides)

Basis: SERP review on 2026-11-15 of all 19 target queries (details in each brief). Scoring:
- **Difficulty (D):** who ranks now. Thin tool pages, `*.pages.dev` sites and forums mean low difficulty. Adobe, Smallpdf, UPDF and Microsoft/Apple docs mean high.
- **Intent (I):** how close the searcher is to using a redaction tool right now.
- **Edge (E):** how much of our unique stack the page can show: auto-detected API keys/cards/IBANs, solid boxes only, no upload, open source, text placeholders with restore, PDF rebuilt from pixels.

Each score runs from 1 to 3, where 3 is best (for D, 3 means easiest).

## Wave 1: write these first

### Landing pages

| # | Page | D | I | E | Why first |
|---|---|---|---|---|---|
| 1 | `/redact-screenshot` | 2 | 3 | 3 | Core use case and the homepage's own job. The SERP is mostly thin single-feature tools (picssizer.pages.dev, selfboot gallery, supademo) and blur-first editors (screenhance, scribe). None auto-detects keys or cards and several push blur. It's the hub for 4 guides. |
| 2 | `/hide-api-keys-in-screenshots` | 3 | 3 | 3 | No dedicated tool page ranks: results are Product Hunt launches, a Setapp workflow, a terminal blog post and unrelated "hide API key in code" threads. Our provider-prefix detection (AWS, GitHub, Stripe, OpenAI, Anthropic and more) is the exact answer. The developer audience links and shares. |
| 3 | `/anonymize-text-for-chatgpt` | 3 | 3 | 3 | Only a few real competitors: Elephas's free in-browser tool, and the Privatiser Firefox add-on (15 users, no ratings, as of 2026-11-15). Our `[EMAIL_1]` placeholders plus paste-back restore match the intent exactly, and AI-privacy queries are growing. |
| 4 | `/redact-bank-statement` | 2 | 3 | 3 | Ranked by vendor tutorials (UPDF, Xodo, Smallpdf, SwifDoo, Redactable) that push desktop apps or uploads. We can use the Fannie Mae rule (lenders need the last 4 account digits, the name, the bank and the transactions) and auto-detect IBANs and card numbers. It's the commercial page for the bank-statement guide. |

`/redact-pdf` is deliberately **not** in wave 1. The head term has the strongest SERP (Adobe, Smallpdf, Wondershare, Xodo, PDF24, Sejda) and a new domain won't move there soon. Write it in wave 2 once the PDF guides have earned links. Until then, the PDF guides link to the home tool.

### Guides

| # | Guide | D | I | E | Why first |
|---|---|---|---|---|---|
| 1 | `/guides/can-blurred-text-be-unblurred` | 3 | 2 | 3 | The SERP is dominated by "unblur" AI-tool pages (Fotor, Picsart, FlexClip, Adobe Express) that answer the opposite intent. Strong primary evidence exists: PoPETs 2016, Bishop Fox Unredacter, Depix, Positive Security. It's timely too: Google Photos' new Redact pen (Sep 2026) uses blur and pixelate. It's highly linkable and supports `/redact-screenshot`. |
| 2 | `/guides/iphone-markup-redaction-safe` | 3 | 3 | 3 | Sources conflict (ioshacker says Markup is fine; 9to5Mac 2018, TapSmart and FPF say the marker leaks). An original, versioned test with screenshots on current iOS settles it. It feeds `/redact-on-iphone-android`. |
| 3 | `/guides/api-key-leaked-in-screenshot-what-to-do` | 3 | 3 | 3 | The SERP is generic "leaked API key" docs (Supabase, Tavily, Resend) with nothing specific to screenshots. We combine provider docs (GitHub, AWS, OpenAI) with an "it was in an image" checklist. Supports landing #2. |
| 4 | `/guides/how-to-check-if-pdf-redaction-worked` | 2 | 2 | 2 | Evergreen and very linkable. Competitors are vendor KB pages (Qoppa, Nutrient, WPS) that only test their own app. We can add a 4-test protocol that works on any file, plus the PoPETs 2023 box-width finding, which almost nobody mentions. It builds topical authority for `/redact-pdf`. |
| 5 | `/guides/is-it-safe-to-send-bank-statement-screenshot` | 3 | 3 | 3 | Thin SERP (oembed.org, Indian loan apps, a duckdns clone of Proton). Real FTC and Fannie Mae sources give it authority. It converts to `/redact-bank-statement`. |
| 6 | `/guides/snipping-tool-quick-redact-limits` | 3 | 2 | 3 | Ranked by how-to blogs (Pureinfotech, Geekrewind, ElevenForum) that explain the steps but not the limits. Microsoft's own page says Quick redact covers **only email addresses and phone numbers**. We show what it leaves visible (keys, cards, IBANs) with a side-by-side test, and add the 2023 acropalypse history. Windows has a huge user base, so it's a quick win. |

## Wave 2 (next), in order

1. `/redact-pdf`: the hub, once 2–3 PDF guides are live.
2. `/guides/is-it-safe-to-share-screenshots-with-chatgpt`: high interest, but OpenAI's help pages blocked our fetch (HTTP 403), so facts need live verification first. Also, TechRepublic and Trend Micro make the SERP mid-difficulty.
3. `/redact-on-iphone-android`: write right after the iPhone Markup guide and reuse its test. The Google Photos Redact pen (blur/pixelate only) gives a strong angle.
4. `/guides/why-pdf-redactions-fail`: covers the Epstein files (Dec 2025), Manafort (Jan 2019) and PoPETs 2023. Search interest in the Epstein angle has peaked, so lead with the evergreen "why".
5. `/guides/redact-pdf-mac-preview`
6. `/compare` and `/guides/best-free-redaction-tools-tested`: write together and run one test session for both. They need the most original testing, and they work better once the site has some authority.
7. `/redact-image`: overlaps heavily with `/redact-screenshot`. Keep it short and photo/ID-focused (EXIF, faces, ID cards) to avoid cannibalization.
8. `/self-hosted-redaction`: low volume, high value (B2B). Write it when we want company/IT traffic.

## Cross-cutting notes

- **Cannibalization watch:** `/redact-screenshot` and `/redact-image` must target different intents. Screenshot means UI, chats, terminals and keys. Image means photos, ID cards, documents shot with a camera, EXIF/GPS.
- **Homepage title** is 82 characters (`RedactPal — Redact screenshots, PDFs & text before you share (free, private)`). Google will truncate it. This is outside the briefs folder, but flag it to the site owner. A suggestion within 60 characters: "Redact Screenshots, PDFs & Text Free – Nothing Uploaded".
- **Sitemap** currently lists only `/`. Add each page as it ships.
