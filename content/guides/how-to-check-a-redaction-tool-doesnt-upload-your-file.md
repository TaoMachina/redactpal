---
title: "Redact Without Uploading: How to Test Any Tool"
description: "Run three one-minute tests, Network tab, airplane mode and the page's security policy, to see if a redaction tool uploads your file. RedactPal passes."
h1: "How to check that a redaction tool doesn't upload your file"
published: 2026-11-16
updated: 2026-11-16
draft: false
toc: auto
cta:
  tool: /
  title: Run the test on RedactPal
  text: "Free, open source (MIT), no account, no ads and no tracking. Open the Network tab, drop a file and watch: nothing is uploaded."
  button: Open RedactPal
related:
  - guides/best-free-redaction-tools
  - guides/how-to-check-if-pdf-redaction-worked
  - guides/can-blurred-text-be-unblurred
  - redact-pdf
  - redact-screenshot
faq_title: Checking for uploads – questions
faq:
  - q: Is a tool that works offline automatically private?
    a: "It means the redaction itself doesn't need a server, which is the part you care about. It doesn't tell you whether the page also sends analytics or other data. That is why the Network tab test matters: it shows every request the page makes while you work."
  - q: Why does the Network tab show requests while I redact?
    a: Web apps load code on demand. Requests for scripts, workers and language data are normal. What matters is where they go and what they carry. Look for POST or PUT requests, for requests to other domains, and for a request whose size is close to your file's size.
  - q: Do I need to be a developer to run this?
    a: No. Opening DevTools, clicking the Network tab and watching the list takes about a minute. The airplane-mode test needs no tools at all.
  - q: Can a tool upload after I close DevTools?
    a: "DevTools only logs while it is open, so keep it open for the whole session. The Content-Security-Policy test covers the rest: a strict policy makes the browser itself refuse connections to other servers, whether or not you are watching."
  - q: What does RedactPal's policy actually block?
    a: "Its `connect-src 'self' blob: data:` rule limits fetch, XHR, WebSocket and beacon requests to RedactPal's own site, so a file can't be sent to any other server. The full policy is in the open-source repo."
  - q: Does a tool that uploads count as unsafe?
    a: Not by definition. Some tools upload to process a file and say so, with a deletion promise. If the document is sensitive, the cleanest option is a tool that never needs to receive it. You decide how much a promise is worth.
---

**To check that a redaction tool doesn't upload your file, run three one-minute tests: watch your browser's Network tab while you redact a file, switch to airplane mode and try again, and read the page's Content-Security-Policy. A tool that never sends your file passes all three. RedactPal does, and its source is open.**

Last tested: November 16, 2026 · Chrome on Windows 11 · By [Yuntao Zou](https://yuntaozou.com)

## Why test instead of trusting "no upload"?

Almost every redaction tool says it is private. Many are honest about it. Some process your file in the browser. Others upload it, then delete it after an hour. The words on the landing page don't tell you which kind you are using, and you are about to hand the tool a bank statement or a contract.

The good news is that your browser records what a page does. You don't need to read code. You need a minute and the three tests below.

[RedactPal](/) is free with no limits, no account, no ads and no tracking, and it runs in the browser. It is a public-good project, and its code is open (MIT) so the claims below can be checked, not just believed. Run the same tests on any other tool you are considering.

## Test 1: What does the Network tab show while you redact?

This is the strongest test, because it shows every request the page makes.

1. Open the tool's page, then open DevTools. In Chrome, press F12 or Ctrl+Shift+J (⌘⌥J on a Mac), per [Chrome's DevTools docs](https://developer.chrome.com/docs/devtools/network). Firefox and Edge use F12. In Safari, turn on the Develop menu in Settings first.
2. Click the **Network** tab and clear the list (the circle-with-a-line icon). Keep DevTools open: it only records while it is open.
3. Drop or paste a file and redact it. Click through the whole job, up to the download.
4. Read the list and look for three red flags:
   - a **POST** or **PUT** request,
   - a request to a domain that isn't the tool's own,
   - a request whose size is close to your file's size.

Click any suspicious row. The **Payload** tab shows what was sent. A tool that uploads your file will show it here.

Requests are not automatically a bad sign. Modern web apps load scripts on demand, and text recognition needs its engine and language data. What you want is **GET requests to the tool's own domain for app files, and nothing that carries your file out**.

## Test 2: Does it still work in airplane mode?

This test needs no tools.

1. Load the tool's page and wait for it to finish.
2. Turn on airplane mode, or turn off Wi-Fi. In Chrome DevTools you can instead set the Network tab's throttling menu to **Offline**.
3. Open a file and redact it.

If the tool still finds and covers the text, the work is happening on your device, because there is no server to talk to. If it stops with a "connection lost" message, it needs a server for something. Ask what.

One caveat. A page you have never visited can't load offline, so visit it once while connected first. Tools built as installable apps (progressive web apps) cache themselves for exactly this.

## Test 3: What does the page's Content-Security-Policy allow?

A **Content-Security-Policy** (CSP) is a rule the site sends to your browser, listing which servers the page may talk to. The `connect-src` part limits where scripts can send data. Per [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src), it covers `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon()`, so a strict `connect-src` stops a page from sending your file to a server it didn't list.

To read it:

1. In DevTools, open the **Network** tab and reload the page.
2. Click the first request (the page itself) and open **Headers**.
3. Find **Content-Security-Policy** under the response headers, and look at `connect-src`.

A policy that lists only the site itself is a strong sign. A policy that allows analytics or storage domains means the page is allowed to send things there. A page with no policy proves nothing either way.

## What does RedactPal show when you run these tests?

We ran the tests on the live site on November 16, 2026, in Chrome on Windows 11, using Chrome's debugging protocol, which logs the same requests as the Network tab. We redacted two fake files: a one-page PDF with a text layer and a scanned, image-only PDF that needs text recognition.

| Test | Result |
|---|---|
| Network tab, text PDF | 9 requests after the file was chosen. All were GET requests for RedactPal's own scripts and the PDF worker. No POST, no request body, no other domain. |
| Network tab, scanned PDF | 15 requests. The same app files, plus the text-recognition engine and English language data, all GET requests to `redactpal.com`. No POST, no other domain. |
| Offline after load (Chrome's offline mode, the same as airplane mode) | The scanned PDF was read, and its items highlighted, with no connection. |
| Content-Security-Policy | `connect-src 'self' blob: data:`, so the page can only talk to its own site. |

The policy is also in the repository. [`public/_headers`](https://github.com/TaoMachina/redactpal/blob/main/public/_headers) holds the header the site is served with, and [`vercel.json`](https://github.com/TaoMachina/redactpal/blob/main/vercel.json) holds the same rule for the other host. The README's "Why you can trust it" section explains the design, and `src/` is the whole app.

The test fits the product: PDFs are rebuilt from pixels in your browser, images are re-encoded locally, and text mode swaps secrets for placeholders like `[EMAIL_1]` before anything is copied. None of that needs a server.

## What would a failing result look like?

If a tool uploads your file, one or more of these will show up:

- a POST or PUT request while you redact, with your file name or a large payload,
- a request to a domain other than the tool's own, such as a storage bucket or an API host,
- a progress bar for "uploading" or "processing on our servers",
- a policy with no `connect-src` limits, or one that lists many third-party domains,
- failure in airplane mode.

None of these means the tool is dishonest. Many state plainly that they process files on a server, and some delete them after a set time. The test tells you which kind of tool you have, so you can decide whether a delete-after-an-hour promise is good enough for this document.

## What doesn't this test tell you?

It tells you where your file goes. It doesn't tell you whether the redaction worked. Check that separately, because a local tool can still leave text under a box. Our guide to [checking whether a PDF redaction worked](/guides/how-to-check-if-pdf-redaction-worked/) covers four tests, and [why blur isn't enough](/guides/can-blurred-text-be-unblurred/) covers images.

If you are comparing tools, [the best free redaction tools](/guides/best-free-redaction-tools/) compares nine tools, and you can start with [redacting a PDF](/redact-pdf/) or [redacting a screenshot](/redact-screenshot/) right now.

<!-- cta -->
