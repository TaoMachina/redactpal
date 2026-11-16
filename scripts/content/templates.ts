// HTML for content pages. App pages (home + landing pages) are the built index.html with three
// markers filled in; guides and the guides index are small static documents that load one
// stylesheet and no script. Every link is relative (see relHref) so dist/ also works from a sub-folder.
import { escapeHtml, htmlToText, renderInline, renderMarkdown, wordCount, type RenderContext } from './markdown.ts';
import { absoluteUrl, relHref, relatedFor, SITE, type Entry, type Faq, type GuideEntry, type PageEntry, type Site } from './model.ts';

/** Same policy as the <meta> in index.html (tests/content.test.ts checks they match). */
export const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; connect-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Same mark as src/ui/app.ts (the app re-renders the masthead with it). */
export const MARK_SVG =
  '<svg class="brand__mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="3" y="7" width="26" height="4" rx="1.5" fill="currentColor" opacity=".35"/><rect x="3" y="14" width="18" height="6" rx="1" fill="currentColor"/><rect x="3" y="23" width="21" height="4" rx="1.5" fill="currentColor" opacity=".35"/></svg>';

export const FEATURES = [
  'Redacts screenshots, photos, PDFs and text in the browser; files are never uploaded',
  'Finds email addresses, phone numbers, credit card numbers, IBANs, US Social Security numbers, IP addresses, passwords, JWTs and API keys',
  'Covers findings with solid, opaque boxes (no blur or pixelation)',
  'On-device text recognition (OCR) for images and scanned PDFs',
  'Hide a name or phrase everywhere it appears after marking it once',
  'Exports images re-encoded without metadata, and PDFs rebuilt from page images with metadata removed',
  'Text placeholders for AI chats, restored locally in the reply',
  'Works offline and can be installed as an app',
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11-15" → "15 November 2026" (fixed English, independent of the build machine's locale). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Link text for an entry: its H1 without a trailing full stop ("Redact a PDF in your browser."). */
export const linkLabel = (e: Entry): string => e.h1.replace(/\.$/, '');

const time = (iso: string) => `<time datetime="${iso}">${formatDate(iso)}</time>`;

/** A JSON-LD data block (never executed, so CSP-safe). "<" is escaped so content can't end the script. */
export function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function masthead(from: string, current?: 'guides'): string {
  const cur = current === 'guides' ? ' aria-current="page"' : '';
  return (
    `<header class="masthead"><a class="brand" href="${relHref(from, '/')}" aria-label="RedactPal home">${MARK_SVG}<span class="brand__name">RedactPal</span></a>` +
    `<nav class="masthead__nav" aria-label="Site"><a href="${relHref(from, '/guides/')}"${cur}>Guides</a></nav></header>`
  );
}

const AUTHOR_LD = { '@type': 'Person', name: SITE.author.name, url: SITE.author.url };
const WEBSITE_ID = `${SITE.origin}/#website`;

export function siteFooter(site: Site, from: string, updated: string): string {
  const link = (to: string, label: string) => `<li><a href="${escapeHtml(relHref(from, to))}">${escapeHtml(label)}</a></li>`;
  const tools = [site.home, ...site.pages].map((p) => link(p.url, p.navLabel)).join('');
  return (
    `<footer class="site-foot"><nav class="site-foot__nav" aria-label="Footer">` +
    `<ul class="site-foot__links">${tools}</ul>` +
    `<ul class="site-foot__links">${link('/guides/', 'Guides')}<li><a href="${SITE.github}" rel="noopener">GitHub</a></li>${link('/llms.txt', 'llms.txt')}</ul>` +
    `</nav><p class="site-foot__meta">Free and open source (MIT). Nothing you redact is uploaded. Made by <a href="${SITE.author.url}" rel="author">${SITE.author.name}</a>. <span class="site-foot__date">Updated ${time(updated)}</span></p></footer>`
  );
}

interface HeadOpts {
  type: 'website' | 'article';
  canonical: string;
  from: string;
}

function socialImage(e: Entry | null): { url: string; alt: string; dims: boolean } {
  if (!e?.image) return { url: absoluteUrl(SITE.ogImage), alt: SITE.ogImageAlt, dims: true };
  const path = /^(?:\.\/)?img\//.test(e.image) ? `/guides/${e.image.replace(/^\.\//, '')}` : e.image;
  return { url: /^https?:/.test(path) ? path : absoluteUrl(path), alt: e.imageAlt ?? e.h1, dims: false };
}

/** <title>, description, canonical, robots and link-preview tags. */
export function headMeta(title: string, description: string, e: Entry | null, o: HeadOpts): string {
  const img = socialImage(e);
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const lines = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${o.canonical}" />`,
    `<meta name="robots" content="${e?.noindex ? 'noindex, follow' : 'index, follow'}" />`,
    `<meta property="og:type" content="${o.type}" />`,
    `<meta property="og:site_name" content="${SITE.name}" />`,
    `<meta property="og:url" content="${o.canonical}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${escapeHtml(img.url)}" />`,
    ...(img.dims ? ['<meta property="og:image:width" content="1200" />', '<meta property="og:image:height" content="630" />'] : []),
    `<meta property="og:image:alt" content="${escapeHtml(img.alt)}" />`,
    ...(o.type === 'article' && e?.published
      ? [`<meta property="article:published_time" content="${e.published}" />`, `<meta property="article:modified_time" content="${e.updated ?? e.published}" />`]
      : []),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${escapeHtml(img.url)}" />`,
  ];
  return lines.join('\n  ');
}

export function faqJsonLd(items: { q: string; html: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: htmlToText(f.html) } })),
  };
}

export function breadcrumbJsonLd(crumbs: { name: string; url: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(c.url) })),
  };
}

/** Visible FAQ (static <details>) and its FAQPage structured data — always generated together. */
function faqBlock(faq: Faq[], title: string, ctx: RenderContext): { html: string; ld: object | null } {
  if (!faq.length) return { html: '', ld: null };
  const items = faq.map((f) => ({ q: f.q, html: renderMarkdown(f.a, ctx).html.trim() }));
  const html =
    `<section class="faq" aria-labelledby="faq-title"><h2 id="faq-title">${escapeHtml(title)}</h2>` +
    items.map((f) => `<details class="faq__item"><summary>${escapeHtml(f.q)}</summary>${f.html}</details>`).join('') +
    `</section>`;
  return { html, ld: faqJsonLd(items) };
}

function relatedBlock(site: Site, e: Entry, from: string, title: string): string {
  const items = relatedFor(site, e);
  if (!items.length) return '';
  return (
    `<nav class="related" aria-labelledby="related-title"><h2 id="related-title">${escapeHtml(title)}</h2><ul class="related__list">` +
    items
      .map((r) => `<li><a href="${escapeHtml(relHref(from, r.url))}">${escapeHtml(linkLabel(r))}</a><p>${escapeHtml(r.description)}</p></li>`)
      .join('') +
    `</ul></nav>`
  );
}

function ctx(site: Site, from: string, base: Omit<RenderContext, 'from' | 'known'>): RenderContext {
  return { ...base, from, known: new Set(site.urls.keys()) };
}

export interface PageRenderOpts {
  version: string;
  imageSize?: RenderContext['imageSize'];
  warn?: (msg: string) => void;
}

/** Home and landing pages: the full app (from the built index.html template) plus static content. */
export function renderAppPage(template: string, site: Site, page: PageEntry, o: PageRenderOpts): string {
  for (const m of ['<!--rp:head-->', '<!--rp:app-->', '<!--rp:below-->'])
    if (!template.includes(m)) throw new Error(`index.html template is missing the ${m} marker`);
  const from = page.url;
  const c = ctx(site, from, o);
  const depth = from.split('/').filter(Boolean).length;
  // The template's own asset links ("./assets/…", "./favicon.svg") are relative to the site root.
  let html = depth ? template.replace(/(\s(?:src|href)=")\.\//g, `$1${'../'.repeat(depth)}`) : template;
  const rootAttr = depth ? '../'.repeat(depth) : './';
  html = html.replace(/<html([^>]*)>/, (_m, attrs: string) => `<html${attrs.replace(/\sdata-root="[^"]*"/, '')} data-root="${rootAttr}">`);

  const isHome = page === site.home;
  const canonical = absoluteUrl(page.url);
  const updated = page.updated ?? site.updated;
  const faq = faqBlock(page.faq, page.faqTitle ?? 'Questions', c);
  const ld: object[] = [];
  if (isHome) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${SITE.origin}/#app`,
      name: SITE.name,
      url: `${SITE.origin}/`,
      description: page.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript and a modern web browser',
      softwareVersion: o.version,
      dateModified: updated,
      featureList: FEATURES,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isAccessibleForFree: true,
      license: 'https://opensource.org/licenses/MIT',
      sameAs: [SITE.github],
      author: AUTHOR_LD,
      publisher: { '@id': `${SITE.origin}/#org` },
    });
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${SITE.origin}/#org`,
      name: SITE.name,
      url: `${SITE.origin}/`,
      logo: absoluteUrl('/icons/icon-512.png'),
      sameAs: [SITE.github],
      founder: AUTHOR_LD,
    });
    // Tells Google the site name ("RedactPal", not the bare domain); other pages point isPartOf here.
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: SITE.name,
      alternateName: ['Redact Pal', 'redactpal.com'],
      url: `${SITE.origin}/`,
      publisher: { '@id': `${SITE.origin}/#org` },
    });
  } else {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: linkLabel(page),
      url: canonical,
      description: page.description,
      dateModified: updated,
      inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': `${SITE.origin}/#app` },
    });
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': `${canonical}#app`,
      name: `${SITE.name} – ${page.navLabel}`,
      url: canonical,
      description: page.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (web browser)',
      browserRequirements: 'Requires JavaScript and a modern web browser',
      dateModified: updated,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isAccessibleForFree: true,
      author: AUTHOR_LD,
      publisher: { '@id': `${SITE.origin}/#org` },
    });
    ld.push(breadcrumbJsonLd([{ name: SITE.name, url: '/' }, { name: linkLabel(page), url: page.url }]));
  }
  if (faq.ld) ld.push(faq.ld);

  const head = [headMeta(page.title, page.description, page, { type: 'website', canonical, from }), ...ld.map(jsonLd)].join('\n  ');

  // Pre-render of the start screen: the app adopts [data-intro] (H1 + intro) instead of drawing
  // its own, so crawlers and the first paint see the same headline as the running app.
  const intro = page.intro ? `<p class="start__lede">${renderInline(page.intro, c)}</p>` : '';
  const dataAttrs = `${page.mode !== 'start' ? ` data-mode="${page.mode}"` : ''}${page.accept !== 'any' ? ` data-accept="${page.accept}"` : ''}`;
  const app =
    `<div id="app"${dataAttrs}><div class="shell">${masthead(from)}<main class="main" id="main">` +
    `<section class="screen start" aria-labelledby="start-title"><div class="start__intro" data-intro>` +
    `<h1 class="start__title" id="start-title" tabindex="-1">${escapeHtml(page.h1)}</h1>${intro}</div>` +
    `<noscript><p class="start__lede">RedactPal needs JavaScript to read your files locally. Nothing is uploaded.</p></noscript>` +
    `</section></main></div></div>`;

  const body = page.body.trim() ? renderMarkdown(page.body, c).html : '';
  // Visible freshness + author line on landing pages (the home page has it in the footer).
  const byline = isHome ? '' : `<p class="dateline dateline--page">Updated ${time(updated)} · By <a href="${SITE.author.url}" rel="author">${SITE.author.name}</a></p>`;
  const below =
    `<div class="page-extra">` +
    (body ? `<section class="page-copy prose prose--quiet">${body}</section>` : '') +
    byline +
    faq.html +
    relatedBlock(site, page, from, 'Related guides') +
    `</div>\n  ` +
    siteFooter(site, from, updated);

  return html.replace('<!--rp:head-->', () => head).replace('<!--rp:app-->', () => app).replace('<!--rp:below-->', () => below);
}

function staticShell(o: { from: string; head: string; cssHref: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}" />
  <meta name="referrer" content="no-referrer" />
  ${o.head}
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#E8ECF1" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0F1318" media="(prefers-color-scheme: dark)" />
  <link rel="icon" href="${relHref(o.from, '/favicon.ico')}" sizes="48x48" />
  <link rel="icon" href="${relHref(o.from, '/favicon.svg')}" type="image/svg+xml" />
  <link rel="icon" href="${relHref(o.from, '/icons/icon-192.png')}" sizes="192x192" type="image/png" />
  <link rel="apple-touch-icon" href="${relHref(o.from, '/icons/apple-touch-icon.png')}" />
  <link rel="stylesheet" href="${relHref(o.from, o.cssHref)}" />
</head>
<body class="site-page">
  <a class="skip" href="#main">Skip to content</a>
  ${o.body}
</body>
</html>
`;
}

export interface StaticRenderOpts extends PageRenderOpts {
  /** Site path of the guide stylesheet, e.g. "/assets/site-abc123.css". */
  cssHref: string;
}

export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(wordCount(markdown) / 220));
}

export function renderGuide(site: Site, g: GuideEntry, o: StaticRenderOpts): string {
  const from = g.url;
  const c = ctx(site, from, o);
  const canonical = absoluteUrl(g.url);
  const updated = g.updated ?? g.published;
  const { html: bodyHtml, toc } = renderMarkdown(g.body, c);
  const faq = faqBlock(g.faq, g.faqTitle ?? 'Questions', c);

  const tool = site.urls.get(g.cta.tool) as PageEntry | undefined;
  const ctaHtml =
    `<aside class="cta" aria-label="Try RedactPal"><p class="cta__title">${escapeHtml(g.cta.title ?? 'Redact it on your device')}</p>` +
    `<p class="cta__text">${renderInline(g.cta.text ?? 'Free, no sign-up, and nothing is uploaded: RedactPal runs in your browser and covers what it finds with solid boxes. You check every box before you share.', c)}</p>` +
    `<a class="cta__btn" href="${escapeHtml(relHref(from, g.cta.tool))}">${escapeHtml(g.cta.button ?? tool?.navLabel ?? 'Open RedactPal')}</a></aside>`;
  const howtoHtml = g.howto
    ? `<section class="howto" aria-labelledby="howto-title"><h2 id="howto-title">${escapeHtml(g.howto.name)}</h2><ol class="howto__steps">` +
      g.howto.steps.map((s) => `<li><strong>${escapeHtml(s.name)}.</strong> ${renderInline(s.text, c)}</li>`).join('') +
      `</ol></section>`
    : '';

  // <!-- cta --> / <!-- howto --> in the body place those blocks; otherwise they follow the body.
  let prose = bodyHtml;
  const place = (marker: RegExp, block: string) => {
    if (!block) return '';
    if (marker.test(prose)) {
      prose = prose.replace(marker, () => block);
      return '';
    }
    return block;
  };
  const howtoAfter = place(/<!--\s*howto\s*-->/, howtoHtml);
  const ctaAfter = place(/<!--\s*cta\s*-->/, ctaHtml);

  const showToc = g.toc === true || (g.toc === 'auto' && toc.length >= 4);
  const tocHtml = showToc
    ? `<nav class="toc" aria-labelledby="toc-title"><p class="toc__title" id="toc-title">On this page</p><ol>` +
      toc.map((t) => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('') +
      `</ol></nav>`
    : '';

  const dateline =
    `<p class="dateline">Published ${time(g.published)}` +
    (updated !== g.published ? ` · Updated ${time(updated)}` : '') +
    ` · ${readingMinutes(g.body)} min read</p>`;

  const img = socialImage(g);
  const ld: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: g.h1.slice(0, 110),
      description: g.description,
      datePublished: g.published,
      dateModified: updated,
      mainEntityOfPage: canonical,
      url: canonical,
      image: [img.url],
      inLanguage: 'en',
      author: AUTHOR_LD,
      publisher: { '@type': 'Organization', name: SITE.name, url: `${SITE.origin}/`, logo: { '@type': 'ImageObject', url: absoluteUrl('/icons/icon-512.png') } },
    },
    breadcrumbJsonLd([
      { name: SITE.name, url: '/' },
      { name: 'Guides', url: '/guides/' },
      { name: linkLabel(g), url: g.url },
    ]),
  ];
  if (faq.ld) ld.push(faq.ld);
  if (g.howto)
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: g.howto.name,
      ...(g.howto.description ? { description: g.howto.description } : {}),
      step: g.howto.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: htmlToText(renderInline(s.text, c)) })),
    });

  const body =
    `${masthead(from)}\n  <main class="site-main" id="main">` +
    `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="${relHref(from, '/')}">Home</a></li><li><a href="${relHref(from, '/guides/')}">Guides</a></li><li aria-current="page">${escapeHtml(g.h1)}</li></ol></nav>` +
    `<article class="article"><header class="article__head"><h1 class="article__title">${escapeHtml(g.h1)}</h1>${dateline}</header>` +
    tocHtml +
    `<div class="prose">${prose}</div>${howtoAfter}${faq.html}${ctaAfter}</article>` +
    relatedBlock(site, g, from, 'Related') +
    `</main>\n  ${siteFooter(site, from, updated)}`;

  const head = [headMeta(g.title, g.description, g, { type: 'article', canonical, from }), ...ld.map(jsonLd)].join('\n  ');
  return staticShell({ from, head, cssHref: o.cssHref, body });
}

export const GUIDES_INDEX = {
  title: 'Redaction guides — RedactPal',
  h1: 'Guides',
  description: 'Practical guides to hiding sensitive information in screenshots, PDFs and text before you share them, and to redacting it so it stays hidden.',
};

export function renderGuidesIndex(site: Site, o: StaticRenderOpts): string {
  const from = '/guides/';
  const canonical = absoluteUrl(from);
  const updated = site.guides.reduce((m, g) => ((g.updated ?? g.published) > m ? (g.updated ?? g.published) : m), '') || site.updated;
  const list = site.guides.length
    ? `<ul class="guide-list">` +
      site.guides
        .map(
          (g) =>
            `<li><h2 class="guide-list__title"><a href="${escapeHtml(relHref(from, g.url))}">${escapeHtml(g.h1)}</a></h2>` +
            `<p>${escapeHtml(g.description)}</p><p class="dateline">${time(g.updated ?? g.published)}</p></li>`,
        )
        .join('') +
      `</ul>`
    : `<p>No guides yet.</p>`;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: GUIDES_INDEX.h1,
      url: canonical,
      description: GUIDES_INDEX.description,
      inLanguage: 'en',
      hasPart: site.guides.map((g) => ({ '@type': 'Article', headline: g.h1.slice(0, 110), url: absoluteUrl(g.url) })),
    },
    breadcrumbJsonLd([
      { name: SITE.name, url: '/' },
      { name: 'Guides', url: from },
    ]),
  ];
  const body =
    `${masthead(from, 'guides')}\n  <main class="site-main" id="main">` +
    `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="${relHref(from, '/')}">Home</a></li><li aria-current="page">Guides</li></ol></nav>` +
    `<header class="article__head"><h1 class="article__title">${GUIDES_INDEX.h1}</h1><p class="article__lede">${escapeHtml(GUIDES_INDEX.description)}</p></header>` +
    list +
    `</main>\n  ${siteFooter(site, from, updated)}`;
  const head = [headMeta(GUIDES_INDEX.title, GUIDES_INDEX.description, null, { type: 'website', canonical, from }), ...ld.map(jsonLd)].join('\n  ');
  return staticShell({ from, head, cssHref: o.cssHref, body });
}
