# Brief: /hide-api-keys-in-screenshots (landing page, wave 1 #2)

## Target queries
- **Primary:** hide API keys in screenshots
- **Secondary:** redact API key screenshot · blur API key in screenshot · hide secrets in terminal screenshot · redact token in screenshot before posting GitHub issue · share logs without leaking keys · remove password from screenshot

## Search intent
Transactional (developer). They are about to paste a terminal, IDE, dashboard or log screenshot into Slack, a GitHub issue, Stack Overflow, Discord or an AI chat, and want the secrets gone without hand-drawing boxes.

## SERP snapshot (2026-11-15)
No dedicated tool page owns this query. Results:
- Product Hunt launches (Shhshot, a macOS app; SnapFrame) and a Setapp community workflow.
- mkennedy.codes "hide those terminal secrets" (a blog post).
- Clueso help doc: blur keys starting with "sk-" in dashboard captures (**recommends blur**).
- Off-intent: "hide API keys in code/Bubble/Lovable" posts, APIMatic masked fields, BrowserStack docs.
- Warp terminal secret redaction (screen-share masking; per search summary, regex supported).

Takeaway: weak, fragmented SERP. A focused page that names key formats and auto-detects them can win quickly.

## Title
- **Recommended:** Hide API Keys in Screenshots – Auto-Detect & Black Out
- **Alt 1:** Redact API Keys and Tokens in Screenshots (Free, Local)
- **Alt 2:** Hide Secrets in Terminal Screenshots – Free, No Upload

**Meta description:** Paste a terminal or dashboard screenshot. RedactPal spots AWS, GitHub, Stripe, OpenAI and Slack keys, JWTs and passwords and boxes them. Free, open source.

## H1
Hide API keys in screenshots automatically before you post them

## Direct answer (40–60 words)
> Paste the screenshot into RedactPal. On-device OCR reads the text and recognizes keys by their prefixes and shapes, including AWS `AKIA…`, GitHub `ghp_`, Stripe `sk_live_`, OpenAI `sk-proj-`, Anthropic `sk-ant-`, Slack `xox…`, JWTs and `password=` lines. It covers them with solid boxes. Check the highlights, then copy the image. Nothing leaves your device.

## Outline
- **[Tool + 3 steps]**
- **H2: Which keys and tokens does RedactPal detect?** A table with Provider | Example prefix (fake) | Notes. Use the exact list from ARCHITECTURE.md: AWS access key ID (plus secret near `aws_secret_access_key`), GitHub `ghp_/gho_/ghs_/ghu_/github_pat_`, GitLab `glpat-`, Slack `xox[abprs]-` and `hooks.slack.com` webhooks, Stripe `sk_live_/rk_live_/pk_live_` and test keys, OpenAI `sk-…/sk-proj-…`, Anthropic `sk-ant-…`, Google `AIza…`, SendGrid `SG.`, npm `npm_`, Hugging Face `hf_`, Twilio, Discord bot tokens. Also JWTs, private key blocks, `Authorization: Bearer`, URLs with `user:pass@` or `?token=`, and `password:`/`secret=` assignments in `.env`/JSON/YAML.
  - H3: Custom secrets (internal hostnames, project codenames): drag once, hide everywhere
- **H2: Why not just blur the key?** Blur and pixelation can be reversed (cite Bishop Fox, Depix). A partly readable key is still a leaked key.
- **H2: Where screenshots leak keys** Terminal output (`env`, `printenv`, `cat .env`), curl commands with `-H "Authorization"`, browser DevTools Network headers, cloud dashboards, CI logs, VS Code with `.env` open.
- **H2: Already posted it? Rotate the key first.** Link to the leaked-key guide. One line quoting GitHub: rotate immediately.
- **H2: Also hiding secrets in text?** Text mode for logs and stack traces, with `[API_KEY_1]` placeholders for AI chats. Link `/anonymize-text-for-chatgpt`.
- **H2: FAQ**
  - Does it detect keys in dark-mode terminals? (test it and state the result)
  - Is the screenshot sent to a server for OCR? (no, Tesseract runs in the browser)
  - Can I add my own secret patterns? (drag-to-hide-everywhere; custom terms)
  - What about keys split across lines?
  - Can my team self-host it? (link `/self-hosted-redaction`)

## Facts to include (verified)
- GitHub: "When you receive an alert, rotate the affected credential immediately to prevent unauthorized access." https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- AWS: "Do not provide your access keys to unauthorized parties… you might give someone permanent access to your account." AWS's documented example key ID is `AKIAIOSFODNN7EXAMPLE` (use it in our demo). https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
- Pixelation is reversible: Bishop Fox (https://bishopfox.com/blog/unredacter-tool-never-pixelation). Depix is "a PoC for a technique to recover plaintext from pixelized screenshots" (https://github.com/spipm/Depix, archived 14 Apr 2026, moved to Codeberg).
- **Verify before use:** OpenAI's "Best practices for API key safety" says to rotate a leaked key immediately from the API Keys page (seen in search snippets; the page returned 403 to our fetcher): https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety

## RedactPal demo / test to show
1. Make 3 test screenshots with **fake or documented example keys only**: (a) dark terminal running `cat .env`, (b) light browser DevTools showing an `Authorization: Bearer <JWT>` header, (c) a Stripe-style dashboard with `sk_test_…`.
2. Record detection results per screenshot in a table (detected / not detected). Publish honestly. If one is missed, show the one-drag fix.
3. GIF: paste → boxes appear → Copy → paste into a GitHub issue draft.

## Internal links
`/` (CTA) · `/guides/api-key-leaked-in-screenshot-what-to-do` · `/anonymize-text-for-chatgpt` · `/redact-screenshot` · `/self-hosted-redaction` · GitHub `src/detect/rules.ts` (source of truth for formats)

## Target length
800–1,000 words plus the key-format table.

## What competitors miss
- A concrete list of the key formats detected. Nobody publishes one.
- The "blur is fine" advice (Clueso) is wrong for secrets. Say why, with sources.
- What to do if it's already posted (rotate, not just delete).

## Avoid
- Real keys in any image, even revoked ones. Use AWS's EXAMPLE key and obviously fake strings.
- Claiming coverage of "all API keys". Name the formats and point to custom terms for others.
- Saying OCR is perfect on tiny fonts. Advise zooming the terminal to 100%+ before capture (a factual tip, not an apology).
