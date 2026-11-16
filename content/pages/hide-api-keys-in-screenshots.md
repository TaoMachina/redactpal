---
title: Hide API Keys in Screenshots – Auto-Detect & Black Out
description: Paste a terminal or dashboard screenshot. RedactPal spots AWS, GitHub, Stripe, OpenAI and Slack keys, JWTs and passwords and boxes them. Free, open source.
h1: Hide API keys in screenshots automatically before you post them
intro: Paste the screenshot. Keys, tokens and passwords are recognized by their shape and covered with solid boxes. Free, open source (MIT), no account, nothing is uploaded.
accept: image
nav_label: Hide API keys
nav_order: 30
published: 2026-11-15
updated: 2026-11-16
draft: false
related:
  - guides/api-key-leaked-in-screenshot-what-to-do
  - redact-screenshot
  - anonymize-text-for-chatgpt
  - guides/can-blurred-text-be-unblurred
  - guides/snagit-smart-redact-free-alternative
faq_title: Hiding API keys — questions
faq:
  - q: Does it detect keys in dark-mode terminals?
    a: "Yes. RedactPal reads light-on-dark text as well as dark-on-light. In our test of a dark-mode terminal at 12px, every key, token and password in the screenshot was found. The one habit worth keeping: capture at 100% zoom or more, and glance over the highlights before you copy."
  - q: Is the screenshot sent to a server for OCR?
    a: No. The OCR engine (Tesseract) is served from the same site and runs in your browser. A Content-Security-Policy blocks connections to other servers. Read about it under "Why you can trust it" in the [README](https://github.com/TaoMachina/redactpal#why-you-can-trust-it).
  - q: Can I add my own secret patterns?
    a: Drag a box over any value once, such as an internal hostname or project codename, and RedactPal offers to hide it everywhere it appears in that image.
  - q: What about keys split across lines?
    a: RedactPal follows a key that wraps onto the next line and boxes the continuation too. Private key blocks are covered from the BEGIN line to the END line, including truncated ones.
  - q: Can my team host it?
    a: Yes. RedactPal is a static site with no backend. The README explains [how to self-host it](https://github.com/TaoMachina/redactpal#self-hosting-companies).
---

## How to hide an API key in a screenshot

1. **Paste the screenshot** (Ctrl+V / ⌘V) or drop the file on this page.
2. **Check the highlights.** Every key, token and password found is boxed. Drag over anything else.
3. **Copy the image** and paste it into your issue, chat or post.

![RedactPal highlighting an AWS access key ID and a Stripe secret key inside a pasted .env snippet in a chat screenshot](img/redactpal-detects-secrets.png "A pasted .env snippet in a fake chat screenshot: the AWS key and the Stripe key are found and highlighted before anything is covered.")

## Which keys and tokens does RedactPal detect?

The list below comes from the detection rules in [`src/detect/rules.ts`](https://github.com/TaoMachina/redactpal/blob/main/src/detect/rules.ts). We ran a made-up or documented example of each provider below, plus JWTs, a private key block, a Bearer header, URL credentials and password and secret assignments, through the same detector the app uses (a throwaway test, not part of the repo). Every one was found.

| Provider or type | Looks like | Notes |
|---|---|---|
| AWS access key ID | `AKIA…`, `ASIA…` + 16 characters | The secret key is covered when assigned to `aws_secret_access_key` |
| GitHub | `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_` | |
| GitLab | `glpat-`, `gldt-`, `glrt-` and related | |
| Slack | `xoxb-`, `xoxp-`, `xoxa-`, `xoxr-`, `xoxs-`, `xapp-` | Plus `hooks.slack.com` webhook URLs |
| Stripe | `sk_live_`, `rk_live_`, `pk_live_`, test keys, `whsec_` | |
| OpenAI | `sk-…`, `sk-proj-…`, `sk-svcacct-…`, `sk-admin-…` | |
| Anthropic | `sk-ant-…` | |
| Google | `AIza…` | |
| SendGrid | `SG.<id>.<secret>` | |
| npm | `npm_…` | |
| Hugging Face | `hf_…` | |
| Twilio | `AC…`, `SK…` + 32 hex characters | |
| Discord | Bot tokens and webhook URLs | |
| JWTs | `eyJ…` three-part tokens | Header must decode to JSON with `alg` |
| Private keys | `-----BEGIN … PRIVATE KEY-----` blocks | Truncated blocks too |
| Headers | `Authorization: Bearer …`, `Basic`, `Token` | |
| URLs | `user:pass@host`, `?token=`, `&api_key=` | |
| Assignments | `password=`, `DB_PASSWORD=`, `API_KEY=`, `secret:` in `.env`, JSON, YAML | High-entropy values for secrets |

This is a list of formats, not every key in existence. For anything else, drag once.

### Custom secrets: drag once, hide everywhere

Internal hostnames, project codenames and customer names have no fixed shape. Drag a box over one and RedactPal offers to hide it everywhere it appears.

## Why not just blur the key?

A partly readable key is still a leaked key, and blur can be undone. In 2022 Bishop Fox [recovered pixelated text with an open-source tool](https://bishopfox.com/blog/unredacter-tool-never-pixelation) and concluded that black bars are the only secure option. Depix is [a proof of concept for recovering plaintext from pixelized screenshots](https://github.com/spipm/Depix) (the repository was archived on 14 April 2026). RedactPal draws solid boxes and re-encodes the image, so nothing is hidden under them. See [can blurred text be unblurred?](/guides/can-blurred-text-be-unblurred/)

## Where screenshots leak keys

- Terminal output from `env`, `printenv` or `cat .env`.
- `curl` commands with `-H "Authorization: Bearer …"`.
- Browser DevTools, Network tab, request headers.
- Cloud and payment dashboards that show a key once.
- CI logs.
- An editor with `.env` open in a side tab.

## Already posted it? Rotate the key first

Deleting the post is not enough: anyone who saw it has the key. GitHub's secret scanning docs say: ["When you receive an alert, rotate the affected credential immediately to prevent unauthorized access."](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) AWS warns that sharing access keys with unauthorized parties might [give someone permanent access to your account](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html). Revoke the key, issue a new one, then read [what to do when an API key leaks in a screenshot](/guides/api-key-leaked-in-screenshot-what-to-do/).

## Also hiding secrets in text?

For logs, stack traces and config files, paste the text instead. RedactPal's text mode swaps each secret for a placeholder such as `[API_KEY_1]`, which is handy for AI chats. See [anonymize text for ChatGPT](/anonymize-text-for-chatgpt/). For other screenshots, see [redact a screenshot](/redact-screenshot/).
