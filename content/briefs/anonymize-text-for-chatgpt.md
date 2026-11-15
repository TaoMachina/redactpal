# Brief: /anonymize-text-for-chatgpt (landing page, wave 1 #3)

## Target queries
- **Primary:** anonymize text for ChatGPT
- **Secondary:** remove personal information before ChatGPT · mask PII before pasting into AI · redact text before using ChatGPT · ChatGPT privacy placeholder tool · anonymize data for Claude / Gemini · de-anonymize AI response

## Search intent
Transactional plus reassurance. They want to use an AI chat on real work (emails, contracts, logs, customer tickets) without handing over names, emails, account numbers or keys. They also want the answer back with real values.

## SERP snapshot (2026-11-15)
| Result | Notes |
|---|---|
| elephas.app/tools/anonymize-text | Title "Anonymize Text Before ChatGPT: Free, Private Tool \| Elephas". H1 "Anonymize text before you paste it into ChatGPT". ~1,000 words. Runs in the browser ("your text never leaves your computer"). Downloads a small AI model for names and addresses. `[NAME_1]` placeholders with paste-back restore. 5-question FAQ including "Can it miss something?". **The strongest competitor**, an upsell page for the Elephas app. |
| addons.mozilla.org Privatiser | Firefox add-on, v0.6.0, MIT, "100% local processing" (developer claim). **15 users, 0 reviews**, updated 5 Apr 2026. |
| pasqualepillitteri.it | GDPR angle (Art. 28), recommends Contify Incognito. |
| (multiple AMO locale duplicates fill the SERP) | Shows how thin the SERP is. |

## Title
- **Recommended:** Anonymize Text for ChatGPT – Free, Restores Your Data
- **Alt 1:** Remove Personal Info Before ChatGPT – Free, Reversible
- **Alt 2:** Mask PII Before Pasting Into ChatGPT, Claude or Gemini

**Meta description:** Swap emails, phone numbers, IBANs and API keys for placeholders like [EMAIL_1], then paste the AI's reply back to restore them. Free, runs offline.

## H1
Anonymize text for ChatGPT, then get your real details back

## Direct answer (40–60 words)
> Paste your text into RedactPal's text mode and copy the safe version. Emails, phone numbers, card numbers, IBANs, API keys and passwords become placeholders like `[EMAIL_1]`. Send that to ChatGPT, Claude or Gemini. When the AI replies, paste the reply back and RedactPal restores your real values. It all happens on your device, with no account.

## Outline
- **[Tool + 3 steps]** Paste text → Copy with placeholders → Paste the AI reply → Copy the restored text
- **H2: What gets replaced?** A table of placeholder examples: `[EMAIL_1]`, `[PHONE_1]`, `[IBAN_1]`, `[CREDIT_CARD_1]`, `[SSN_1]`, `[API_KEY_1]`, `[JWT_1]`, `[PASSWORD_1]`, `[SECRET_1]`, `[IP_ADDRESS_1]`. Custom terms you add, such as names, become `[CUSTOM_1]`. These are the exact stems from `src/detect/placeholders.ts`. The same value always gets the same placeholder, so the AI can follow the text.
  - H3: Names, client names, project codenames: add them once and they're replaced everywhere
- **H2: Why placeholders instead of `***`?** The AI keeps the structure ("reply to [EMAIL_1]") and you get usable output back.
- **H2: Where is the mapping stored?** Only in your browser tab. It never goes to the AI or to us.
- **H2: Do AI chats keep what you paste?** A neutral paragraph. Settings exist (training opt-out, temporary chats), but the safest data is data you never send. Link the ChatGPT screenshot guide.
- **H2: Work use: GDPR, client data, NDAs** A short, non-legal paragraph: minimize personal data before sending it to any processor. No compliance claims.
- **H2: FAQ**
  - Does this work with Claude, Gemini, Copilot? (yes, it's copy-paste)
  - What if the AI changes a placeholder's format, like `[Email 1]`? (test the restore tolerance; the regex accepts spacing and underscore variants)
  - Is my text uploaded? (no)
  - Can I anonymize a screenshot instead? (yes, image mode; link `/redact-screenshot`)
  - Is it free? (yes, MIT, no account)

## Facts to include (verified)
- Elephas's tool runs in the browser and uses `[NAME_1]`-style placeholders (their page): https://elephas.app/tools/anonymize-text. Use it in the comparison sentence only if needed. Our differences are fully open source (MIT), works offline after first load, no model download, and a detected-secrets list.
- **Verify on the live page before citing:** OpenAI Data Controls FAQ. Turning off "Improve the model for everyone" stops new conversations being used for training. Temporary Chats are deleted after 30 days. Feedback (thumbs) can make a conversation usable for training. (Seen in search snippets of https://help.openai.com/en/articles/7730893-data-controls-faq. Our fetcher got 403. Writer must open it and quote the current wording with the date.)
- RedactPal behavior: llms.txt/README ("placeholder version to send to an AI chat… paste the AI's reply back to restore").

## RedactPal demo / test to show
1. Sample text: a fake customer complaint email with a name, email, phone, an IBAN (use a published example IBAN such as `GB82 WEST 1234 5698 7654 32`, which validates mod-97), and an order number.
2. Screen: placeholder output.
3. Paste it into ChatGPT (redact the account UI) and ask for a polite reply.
4. Paste the reply back. Screen: restored reply with real values.
5. Test and document: does restore work if the AI writes `[EMAIL 1]`, `[email_1]` or `\[EMAIL\_1\]` (markdown-escaped)? The regex comment in `placeholders.ts` lists all three as accepted. Confirm in the UI and say so.

## Internal links
`/` (CTA, text mode) · `/guides/is-it-safe-to-share-screenshots-with-chatgpt` · `/hide-api-keys-in-screenshots` · `/redact-screenshot`

## Target length
800–1,000 words.

## What competitors miss
- An open-source, inspectable implementation (Elephas is a product funnel; Privatiser has 15 users).
- Secrets for developers: API keys, JWTs and `.env` lines in logs, not just PII.
- A clear explanation of where the mapping lives.

## Avoid
- "Makes ChatGPT GDPR-compliant" or any legal guarantee.
- Claiming names are auto-detected. Show "add once, replaced everywhere".
- Quoting OpenAI retention terms without checking the live page and adding the date.
