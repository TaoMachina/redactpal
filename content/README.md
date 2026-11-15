# Site content

Everything in this folder is turned into static pages at build time by `scripts/content/` (a Vite
plugin). Nothing here runs in the browser, and the pages load nothing from other sites.

```
content/
  pages/index.md          → /                  the home page (the tool + copy below it + FAQ)
  pages/<slug>.md         → /<slug>/           a landing page: the full tool, with its own headline,
                                               preset, copy, FAQ and related guides
  guides/<slug>.md        → /guides/<slug>/    an article (static HTML + one stylesheet, no script)
  guides/img/<file>       → /guides/img/<file> images used in guides (and pages)
  llms.txt                → /llms.txt          the hand-written part; the "## Links" section is generated
  briefs/                 writing briefs (not built)
```

Also generated: `/guides/` (list of guides, newest first), `/sitemap.xml` (every page, `lastmod` from
front matter) and `/llms-full.txt` (plain text of every page and guide). The header ("Guides") and
footer (tool pages, guides, GitHub, llms.txt, "Updated <date>") are added to every page.

## Add a page

1. Create `content/pages/<slug>.md` or `content/guides/<slug>.md`. The file name is the URL: lowercase
   letters, digits and hyphens (`redact-bank-statement.md` → `/redact-bank-statement/`).
2. Add front matter (below) and write the body in Markdown.
3. `npm run dev` and open `http://localhost:5173/<slug>/` (or `/guides/<slug>/`); pages reload when you save.
   Drafts are shown in dev but left out of the build.
4. `npm test` checks the shipped content (title ≤ 60 characters, description ≤ 155, no broken internal
   links, valid structured data). `npm run build` prints the same warnings.

## Front matter

```yaml
---
title: Redact a PDF Online Free — No Upload | RedactPal   # <title> and link previews; ≤ 60 characters
description: Black out account numbers … nothing is uploaded.  # meta description; ≤ 155 characters
h1: Redact a PDF in your browser.     # visible headline (default: title)
published: 2026-11-15                 # YYYY-MM-DD; required for guides
updated: 2026-11-20                   # YYYY-MM-DD; default: published. Used for sitemap lastmod,
                                      # the dateline, dateModified and the footer's "Updated"
draft: false                          # true = not built (still visible in `npm run dev`)
noindex: false                        # true = built, but "noindex" and left out of sitemap/llms
image: img/pdf-before-after.png       # link-preview image (default: /og.png); img/… or a site path
image_alt: A PDF page with two account numbers blacked out
related:                              # links at the bottom; a page slug, guides/<slug>, or / for home
  - guides/can-blurred-text-be-unblurred
  - redact-pdf
faq_title: Redacting PDFs — questions # heading of the FAQ (default: "Questions")
faq:                                  # visible FAQ + FAQPage structured data (always both)
  - q: Can someone copy the text out from under the black boxes?
    a: No. Every page is rebuilt from pixels…   # Markdown allowed
---
```

Quote a value that contains `: ` or starts with `[`, `{`, `"`, `*`, `&` or `#`
(`a: "Names: draw a box over one."`).

### Landing pages only (`content/pages/`)

```yaml
intro: Drop a PDF, check every page, download a safe copy. Nothing is uploaded.  # one line under the H1, above the tool (Markdown allowed)
mode: start        # start (default) = the drop zone; text = open straight into text mode
accept: any        # any (default) | pdf | image = drop-zone wording and file-picker filter
nav_label: Redact a PDF   # short name in the footer and on guide buttons (default: h1)
nav_order: 10      # footer order (lower first; default 100; the home page uses 0)
```

`mode` and `accept` are written onto `<div id="app" data-mode="…" data-accept="…">` and read by the app
when it starts (`src/ui/preset.ts`). Pasting or dropping any supported file still works on every page.

The body is shown **below the tool** on the start screen (it is hidden while someone is reviewing a
file), followed by the FAQ and "Related guides". Start with `##` headings; the H1 comes from front matter.
Without a `related` list, a page links to guides whose `cta.tool` is that page, then the newest guides.

### Guides only (`content/guides/`)

```yaml
toc: auto          # auto (default: shown with 4+ ## headings) | true | false
cta:               # the "try it" box; default: the home page with generic wording
  tool: redact-pdf # page slug, or / for the home page
  title: Redact your PDF on your device
  text: Free, no sign-up, nothing is uploaded.   # Markdown allowed
  button: Redact a PDF                            # default: the tool page's nav_label
howto:             # optional: a numbered steps section + HowTo structured data
  name: How to redact a PDF
  description: Optional one-line summary.
  steps:
    - name: Open the PDF
      text: Drop it on redactpal.com/redact-pdf/.
```

Guides get Article and BreadcrumbList structured data automatically; FAQPage and HowTo only when the
front matter has `faq` / `howto`. Put `<!-- cta -->` (or `<!-- howto -->`) on its own line in the body to
place that block there; otherwise the steps follow the body and the CTA box ends the article.

## Markdown

GitHub-flavoured Markdown: headings (`##`, `###` get anchor ids; `##` feed the table of contents),
lists, **bold**, `code`, fenced code blocks, tables (they scroll sideways on phones), links and images.

- Internal links: write site paths, `[Redact a PDF](/redact-pdf/)`. They are made relative at build time
  and checked (unknown pages are reported).
- Images: put the file in `content/guides/img/` and write `![What it shows](img/file.png)`. Width and
  height are filled in and images load lazily. A title becomes a caption:
  `![Alt text](img/file.png "Caption under the image")`.
- Keep it accurate: say what RedactPal does and doesn't do (it doesn't detect names or addresses by
  itself), cite sources with links, and don't invent numbers.
