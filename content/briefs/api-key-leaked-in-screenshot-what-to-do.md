# Brief: /guides/api-key-leaked-in-screenshot-what-to-do (guide, wave 1 #3)

## Target queries
- **Primary:** API key leaked in screenshot, what to do
- **Secondary:** accidentally posted API key in screenshot · leaked OpenAI key what to do · exposed AWS key in image · rotate leaked API key · shared screenshot with password · secret in Slack screenshot

## Search intent
Urgent and procedural. Something was posted or sent; they need ordered steps, per provider, in minutes.

## SERP snapshot (2026-11-15)
- Provider docs: Supabase "Rotate a leaked or compromised API key"; Tavily "API key management"; Resend "How to handle a leaked API key"; moleapi.
- Blogs: freecodecamp "How to fix a leaked API key"; Truffle Security (AWS key in git); hacked.com; axonbuild; newly.app ("Leaked OpenAI API Key on GitHub: How to Check and Rotate"); claude-codex.fr "Act in the next 5 minutes"; agenticaisecured.pages.dev.
- Almost all assume **git leaks**. Screenshot-specific advice appears only as a line ("screenshots get indexed… OCR bots scan them", per a search summary; unattributed, so don't cite).

Patterns: "What to Do", "How to Fix", "Act in the Next 5 Minutes", "Check and Rotate".

## Title
- **Recommended:** API Key Leaked in a Screenshot? What to Do Right Now
- **Alt 1:** Leaked an API Key in a Screenshot? 6 Steps to Fix It
- **Alt 2:** Posted a Screenshot With an API Key? Rotate It First

**Meta description:** Posted a screenshot showing an API key? Rotate it first, check usage logs, then delete the image. Steps and official links for AWS, GitHub, OpenAI.

## H1
API key leaked in a screenshot: what to do right now

## Direct answer (40–60 words)
> Treat the key as compromised. Deleting the post doesn't make it safe, because anyone who saw or saved the image can still read it. First revoke or rotate the key in the provider's dashboard, then update your apps, check the usage and billing logs for calls you didn't make, and only then delete the screenshot.

## Outline
- **H2: Step 1: Revoke or rotate the key (now)** Rotate-first vs revoke-first. OpenAI suggests create replacement → switch → revoke for zero downtime (verify). For a public post, revoke first if you can tolerate downtime.
- **H2: Step 2: Update everything that used it** Env vars, CI secrets, serverless configs.
- **H2: Step 3: Check for abuse** Usage dashboards, billing, AWS CloudTrail.
- **H2: Step 4: Look at what else the screenshot showed** Other keys in the same `.env`, session cookies, internal hostnames, emails. Rotate those too.
- **H2: Step 5: Delete or replace the image** Slack/Discord/GitHub edit history; AI chat history; ask the recipient to delete it. Replace it with a redacted version made in RedactPal.
- **H2: Step 6: Stop it happening again** Redact before sharing (RedactPal auto-detects provider keys), spend limits, scoped keys, short-lived credentials (AWS recommends temporary credentials over access keys).
- **H2: Provider quick links** A table: AWS, GitHub, GitLab, Slack, Stripe, OpenAI, Anthropic, Google Cloud, SendGrid, npm, Hugging Face, Twilio, Discord. Link each **official** revoke/rotate doc (writer: open each and use the canonical URL).
- **H2: Does blurring the key in the screenshot help?** No: blur and pixelation can be reversed. Link the blur guide.
- **H2: FAQ**
  - It was only in a private Slack/DM. Do I still rotate? (yes. Access lists change and images get forwarded.)
  - It was a test key. (lower risk; still rotate if it's reusable)
  - I pasted the screenshot into ChatGPT. (treat it as shared with a third party; rotate; see the ChatGPT guide)
  - How fast do bots find leaked keys? (no verified figure for images; don't give a number)

## Facts to include (verified)
- GitHub: "When you receive an alert, rotate the affected credential immediately to prevent unauthorized access." Removing secrets from history is often unnecessary if the credential is already revoked. https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning
- AWS IAM: use temporary credentials (IAM roles) instead of long-term access keys; "Do not provide your access keys to unauthorized parties… you might give someone permanent access to your account"; use AWS CloudTrail to monitor key usage. https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
- **Verify before citing** (fetch returned 403; content seen in search snippets): OpenAI "Best Practices for API Key Safety": "If you believe your key has been leaked, rotate your key immediately from the API Keys page"; spend limits; expiring project keys. https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- **Verify before citing:** Supabase "Rotate a leaked or compromised API key" (fix the root cause first): https://supabase.com/docs/guides/security/rotate-leaked-api-keys
- Pixelation/blur reversible: https://bishopfox.com/blog/unredacter-tool-never-pixelation

## RedactPal demo / test to show
"Replace the image" step: take the leaked-style screenshot (fake keys) → RedactPal → boxed version, ready to repost. Short GIF.

## Internal links
`/hide-api-keys-in-screenshots` (primary CTA) · `/anonymize-text-for-chatgpt` · `/guides/can-blurred-text-be-unblurred` · `/`

## Target length
1,200–1,500 words. Numbered steps up front, scannable.

## What competitors miss
- Screenshot-specific steps: other secrets in the frame, chat-edit history, AI chat uploads.
- A one-table list of official rotation pages.
- Prevention at the moment of sharing, not just in git.

## Avoid
- Invented statistics ("bots find keys in 4 minutes" refers to git scanning studies, if any; don't apply it to images without a source).
- Telling people deleting the post is enough.
- Linking unofficial rotation guides when an official doc exists.
