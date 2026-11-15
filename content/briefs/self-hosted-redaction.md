# Brief: /self-hosted-redaction (landing page, wave 2 #8)

## Target queries
- **Primary:** self-hosted redaction tool
- **Secondary:** open source redaction tool · on-premise PDF redaction · internal redaction tool for company · redaction tool no cloud · offline redaction software · self-host screenshot redaction

## Search intent
Commercial investigation (IT, security, legal-ops, developers). They need a redaction tool staff can use without sending documents to a third-party cloud, ideally open source, cheap to run and approved by security.

## SERP snapshot (2026-11-15)
- Stirling PDF, "PDF Redaction is now open source": redaction open source "as of version 0.17.0". Manual boxes plus Auto Redaction with regex. Self-hostable PDF suite. A Docker image exists (hub.docker.com/r/stirlingtools/stirling-pdf). It runs as a server application: confirm the architecture and requirements in its docs before writing the comparison row. https://www.stirling.com/blog/redaction-open-source
- Python packages: doc-redaction (needs Tesseract and Poppler), LocalRedact (AGPL), Redactron (AGPL-3.0, rules-based, re-scans output). Per PyPI snippets; verify licenses on each page before citing.
- RefactorSecurity/redactor: browser-based structured-text sanitizer for AI sharing. Loads libraries from CDNs, 11 stars (fetched 2026-11-15).
- Commercial self-hosted: pdf-tools AI Smart Redact (Docker), SecuRedact.
- Listicles: itechguides "Best Document Redaction Software in 2026"; wildandfreetools has an "Open-Source and Self-Hosted Options" H2.

Gap: nothing self-hostable covers **screenshots plus PDFs plus text** as static files with no server-side processing.

## Title
- **Recommended:** Self-Hosted Redaction Tool – Open Source, Static Files
- **Alt 1:** Open-Source Redaction Tool You Can Host Internally
- **Alt 2:** On-Premise Redaction for Screenshots, PDFs & Text (MIT)

**Meta description:** Host RedactPal on your intranet: static files, no backend, no data leaves employees' devices. MIT-licensed redaction for screenshots, PDFs and text.

## H1
Self-host RedactPal: open-source redaction with no server to secure

## Direct answer (40–60 words)
> RedactPal is MIT-licensed static files. Run `npm install && npm run build` and copy `dist/` to any internal web server, S3 bucket or GitHub Pages. There's no backend or database: OCR, detection and export run in each employee's browser, and the Content-Security-Policy blocks connections to other servers. Documents never leave the device.

## Outline
- **H2: Why a static, client-side tool is easier to approve** No server receives files, nothing to patch beyond a web server, no data processing agreement with a vendor, and the CSP is enforceable as an HTTP header.
- **H2: Deploy in 5 minutes** Build steps from the README; nginx header snippet (copy it from the README); Netlify/Cloudflare `_headers` and `vercel.json` are already included.
  - H3: Why the CSP must be an HTTP header (a `<meta>` CSP doesn't cover OCR/PDF web workers, per the README)
- **H2: What it redacts** Screenshots, PDFs and text. Link the detection list in `src/detect/rules.ts`.
- **H2: How it compares to other self-hosted options** Table: RedactPal | Stirling PDF | Python packages (doc-redaction etc.). Columns: license, inputs (image/PDF/text), where processing runs (browser vs server), server requirements, auto-detection of secrets, output method. Fill Stirling and the others **only from their docs**, with dates.
- **H2: Customize for your organization** Fork it: add internal key formats or codenames to `rules.ts`, brand it, pin a version. MIT allows commercial use.
- **H2: Security review checklist** No third-party requests (verify in DevTools), a service worker for offline use, no analytics, an auditable dependency list (`package.json`: pdf-lib, pdfjs-dist, tesseract.js).
- **H2: FAQ**
  - Does it need a GPU or a server? (no)
  - Can it run fully offline / air-gapped? (yes after build; all assets same-origin)
  - How do updates work? (rebuild from a tagged release; the service worker updates clients)
  - Is there support? (GitHub issues; no paid tier, so don't invent one)
  - License obligations? (MIT: keep the notice)

## Facts to include (verified)
- README: static site, no backend; `npm run build` outputs `dist/`; the CSP header must be sent as HTTP; the nginx snippet. https://github.com/stefano2007517-star/redactpal
- Stirling PDF redaction open source as of 0.17.0, with regex auto-redaction: https://www.stirling.com/blog/redaction-open-source
- RefactorSecurity/redactor uses CDN-loaded libraries (Tailwind, CodeMirror 5, JS-YAML, JSZip) and targets structured text: https://github.com/RefactorSecurity/redactor
- Dependencies: `package.json` in the repo (pdf-lib ^1.17.1, pdfjs-dist, tesseract.js ^7).

## RedactPal demo / test to show
1. A terminal recording: clone → build → `npx serve dist` → open in the browser.
2. DevTools Network tab with zero cross-origin requests during a redaction.
3. `curl -I` on the deployed page showing the CSP header.

## Internal links
`/` · `/compare` · `/hide-api-keys-in-screenshots` · `/redact-pdf` · GitHub repo and ARCHITECTURE.md

## Target length
900–1,200 words plus code blocks.

## What competitors miss
- Client-side-only architecture: no document server at all.
- A single tool for screenshots, PDFs and AI-chat text.
- A concrete security-review checklist.

## Avoid
- Claiming compliance certifications (SOC 2, HIPAA, ISO).
- Mischaracterizing Stirling PDF. It's a strong PDF suite. Our difference is client-side processing plus screenshot/text coverage.
- Quoting AGPL details for Python packages without opening each package page.
