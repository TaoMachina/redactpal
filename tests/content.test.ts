// Content build (scripts/content/): front matter, URLs, Markdown, sitemap, llms files, JSON-LD.
// @ts-ignore -- no @types/node in this project; vitest runs in Node
import { readdirSync, readFileSync } from 'node:fs';
// @ts-ignore -- see above
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildSite,
  ContentError,
  CSP,
  entryUrl,
  formatDate,
  jsonLd,
  loadSite,
  outputFile,
  parseEntry,
  parseFrontMatter,
  refToUrl,
  relHref,
  renderLlms,
  renderMarkdown,
  renderSitemap,
  sitemapEntries,
  slugify,
  type SourceFile,
} from '../scripts/content/index.ts';
import { appRootUrl } from '../src/core/root';
import { dropzoneCopy, readPreset } from '../src/ui/preset';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const page = (slug: string, fm: string, body = '') => ({ path: `pages/${slug}.md`, text: `---\n${fm}\n---\n${body}` });
const guide = (slug: string, fm: string, body = '') => ({ path: `guides/${slug}.md`, text: `---\n${fm}\n---\n${body}` });

const HOME = page(
  'index',
  'title: Home title\ndescription: Home description\nh1: Hide it.\nintro: Intro with a [link](/guides/g1/).\nupdated: 2026-11-01\nnav_label: Tool\nfaq:\n  - q: Is it free?\n    a: Yes, **free**.',
  '## What it does\n\nIt redacts.',
);
const PDF = page('redact-pdf', 'title: PDF title\ndescription: PDF description\naccept: pdf\nnav_label: Redact a PDF\nupdated: 2026-11-10');
const G1 = guide(
  'g1',
  'title: Guide one\ndescription: First guide\npublished: 2026-10-01\nupdated: 2026-11-12\ncta:\n  tool: redact-pdf\nfaq:\n  - q: Why?\n    a: Because.\nhowto:\n  name: How to redact\n  steps:\n    - name: Open\n      text: Open the page.\n    - name: Check\n      text: Check the boxes.',
  'Intro.\n\n## One\n\n## Two\n\n<!-- cta -->\n\n## Three\n\n## Four\n',
);
const G2 = guide('g2', 'title: Guide two\ndescription: Second guide\npublished: 2026-11-05\ndraft: true');

const TEMPLATE = `<!doctype html>
<html lang="en">
<head>
  <!--rp:head-->
  <link rel="icon" href="./favicon.svg" />
  <script type="module" crossorigin src="./assets/index-abc.js"></script>
  <link rel="stylesheet" href="./assets/index-abc.css">
</head>
<body>
  <!--rp:app-->
  <!--rp:below-->
</body>
</html>`;

const OPTS = { version: '1.2.3', cssHref: '/assets/site-x.css' };

/** Every JSON-LD block in a page, parsed (throws if one isn't valid JSON). */
function ldBlocks(html: string): Array<Record<string, unknown>> {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

describe('front matter', () => {
  it('splits YAML from the body (CRLF and BOM tolerated)', () => {
    const { data, body } = parseFrontMatter('\uFEFF---\r\ntitle: Hi\r\ntags: [a, b]\r\n---\r\n# Body\r\n');
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] });
    expect(body).toBe('# Body\n');
  });
  it('keeps unquoted dates as strings', () => {
    expect(parseFrontMatter('---\npublished: 2026-11-15\n---\n').data.published).toBe('2026-11-15');
  });
  it('treats a file without front matter as body only', () => {
    expect(parseFrontMatter('Just text')).toEqual({ data: {}, body: 'Just text' });
  });
  it('reports invalid YAML with the file name', () => {
    expect(() => parseFrontMatter('---\ntitle: [unclosed\n---\n', 'content/pages/x.md')).toThrow(/content\/pages\/x\.md/);
  });
});

describe('entries', () => {
  it('fills defaults for landing pages', () => {
    const e = parseEntry(page('redact-text', 'title: T\ndescription: D'));
    expect(e).toMatchObject({ kind: 'page', slug: 'redact-text', url: '/redact-text/', h1: 'T', mode: 'start', accept: 'any', navLabel: 'T', draft: false });
  });
  it('reads presets', () => {
    const e = parseEntry(page('redact-text', 'title: T\ndescription: D\nmode: text\naccept: image'));
    expect(e).toMatchObject({ mode: 'text', accept: 'image' });
  });
  it('rejects bad values with the file name', () => {
    expect(() => parseEntry(page('x', 'description: D'))).toThrow(/content\/pages\/x\.md: "title" is required/);
    expect(() => parseEntry(page('x', 'title: T\ndescription: D\nmode: video'))).toThrow(/"mode" must be one of/);
    expect(() => parseEntry(page('x', 'title: T\ndescription: D\nupdated: 15/11/2026'))).toThrow(/date like/);
    expect(() => parseEntry(page('Bad_Slug', 'title: T\ndescription: D'))).toThrow(ContentError);
    expect(() => parseEntry(page('guides', 'title: T\ndescription: D'))).toThrow(/reserved/);
    expect(() => parseEntry(guide('g', 'title: T\ndescription: D'))).toThrow(/"published" is required/);
    expect(() => parseEntry(guide('g', 'title: T\ndescription: D\npublished: 2026-11-02\nupdated: 2026-11-01'))).toThrow(/before/);
  });
  it('warns about unknown keys and long titles/descriptions', () => {
    const warnings: string[] = [];
    parseEntry(page('x', `title: ${'t'.repeat(61)}\ndescription: ${'d'.repeat(156)}\ntitel: oops`), (w) => warnings.push(w));
    expect(warnings.join('\n')).toMatch(/unknown front-matter key "titel"/);
    expect(warnings.join('\n')).toMatch(/title is 61 characters/);
    expect(warnings.join('\n')).toMatch(/description is 156 characters/);
  });
  it('defaults updated to published and the CTA to the home page', () => {
    const g = parseEntry(guide('g', 'title: T\ndescription: D\npublished: 2026-01-02'));
    expect(g).toMatchObject({ url: '/guides/g/', updated: '2026-01-02', toc: 'auto', cta: { tool: '/' } });
  });
});

describe('URLs', () => {
  it('maps entries to paths and output files', () => {
    expect(entryUrl('page', 'index')).toBe('/');
    expect(entryUrl('page', 'redact-pdf')).toBe('/redact-pdf/');
    expect(entryUrl('guide', 'x')).toBe('/guides/x/');
    expect(outputFile('/')).toBe('index.html');
    expect(outputFile('/guides/x/')).toBe('guides/x/index.html');
  });
  it('makes relative links from any depth', () => {
    expect(relHref('/', '/')).toBe('./');
    expect(relHref('/', '/guides/')).toBe('./guides/');
    expect(relHref('/redact-pdf/', '/')).toBe('../');
    expect(relHref('/guides/x/', '/redact-pdf/#faq')).toBe('../../redact-pdf/#faq');
    expect(relHref('/guides/x/', 'https://example.com/')).toBe('https://example.com/');
    expect(relHref('/guides/x/', '//cdn.example/x')).toBe('//cdn.example/x');
  });
  it('normalises references', () => {
    expect(refToUrl('redact-pdf')).toBe('/redact-pdf/');
    expect(refToUrl('/guides/x/')).toBe('/guides/x/');
    expect(refToUrl('/')).toBe('/');
    expect(refToUrl('index')).toBe('/');
  });
  it('slugifies headings', () => {
    expect(slugify('Why “redacted” PDFs aren’t safe!')).toBe('why-redacted-pdfs-aren-t-safe');
    expect(slugify('Café & crème')).toBe('cafe-creme');
  });
});

describe('site', () => {
  it('drops drafts (unless asked) and orders entries', () => {
    const site = loadSite([G2, G1, PDF, HOME]);
    expect(site.entries.map((e) => e.url)).toEqual(['/', '/redact-pdf/', '/guides/g1/']);
    expect(loadSite([G2, G1, PDF, HOME], { includeDrafts: true }).guides.map((g) => g.slug)).toEqual(['g2', 'g1']);
    expect(site.updated).toBe('2026-11-12');
  });
  it('needs a home page', () => {
    expect(() => loadSite([PDF])).toThrow(/index\.md/);
  });
  it('warns about links to missing or draft pages', () => {
    const warnings: string[] = [];
    loadSite([HOME, guide('g3', 'title: T\ndescription: D\npublished: 2026-01-01\nrelated: [g2, guides/g2]'), G2], { warn: (w) => warnings.push(w) });
    expect(warnings.some((w) => /\/g2\/, which does not exist/.test(w))).toBe(true);
    expect(warnings.some((w) => /\/guides\/g2\/, which is a draft/.test(w))).toBe(true);
  });
});

describe('markdown', () => {
  const ctx = { from: '/guides/x/', known: new Set(['/', '/redact-pdf/']) };
  it('adds heading ids, collects H2s and dedupes ids', () => {
    const r = renderMarkdown('## Intro\n\n### Detail\n\n## Intro\n', ctx);
    expect(r.html).toContain('<h2 id="intro">Intro</h2>');
    expect(r.html).toContain('<h3 id="detail">Detail</h3>');
    expect(r.html).toContain('<h2 id="intro-2">Intro</h2>');
    expect(r.toc).toEqual([
      { id: 'intro', text: 'Intro' },
      { id: 'intro-2', text: 'Intro' },
    ]);
  });
  it('rewrites internal links and warns about unknown pages', () => {
    const warnings: string[] = [];
    const r = renderMarkdown('[a](/redact-pdf/) [b](/nope/) [c](https://example.com)', { ...ctx, warn: (w) => warnings.push(w) });
    expect(r.html).toContain('href="../../redact-pdf/"');
    expect(r.html).toContain('href="https://example.com" rel="noopener"');
    expect(warnings).toEqual(['/guides/x/: link to unknown page /nope/']);
  });
  it('points img/ at /guides/img/ with size and lazy loading', () => {
    const r = renderMarkdown('![Alt](img/shot.png "A caption")', { ...ctx, imageSize: () => ({ width: 640, height: 360 }) });
    expect(r.html.trim()).toBe('<figure><img src="../../guides/img/shot.png" alt="Alt" width="640" height="360" loading="lazy" decoding="async"><figcaption>A caption</figcaption></figure>');
  });
  it('wraps tables and escapes code', () => {
    const r = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n```html\n<script>x</script>\n```\n', ctx);
    expect(r.html).toMatch(/^<div class="table-wrap"><table>/);
    expect(r.html).toContain('</table></div>');
    expect(r.html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('sitemap and llms', () => {
  const site = loadSite([HOME, PDF, G1, guide('hidden', 'title: H\ndescription: D\npublished: 2026-01-01\nnoindex: true')]);
  it('lists every indexable page with its lastmod', () => {
    expect(sitemapEntries(site)).toEqual([
      { loc: 'https://redactpal.com/', lastmod: '2026-11-01' },
      { loc: 'https://redactpal.com/redact-pdf/', lastmod: '2026-11-10' },
      { loc: 'https://redactpal.com/guides/', lastmod: '2026-11-12' },
      { loc: 'https://redactpal.com/guides/g1/', lastmod: '2026-11-12' },
    ]);
    const xml = renderSitemap(site);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).not.toContain('hidden');
  });
  it('replaces the Links section of llms.txt and keeps the rest', () => {
    const out = renderLlms('# RedactPal\n\nIntro.\n\n## Links\n\n- old\n\n## After\n\nKept.\n', site);
    expect(out).toContain('Intro.');
    expect(out).not.toContain('- old');
    expect(out).toContain('- [Guide one](https://redactpal.com/guides/g1/): First guide');
    expect(out).toContain('- [Full text](https://redactpal.com/llms-full.txt)');
    expect(out).toMatch(/\n## After\n\nKept\.\n$/);
    expect(renderLlms('# RedactPal\n', site)).toContain('\n## Links\n');
  });
});

describe('rendered pages', () => {
  const built = buildSite({ files: [HOME, PDF, G1, G2], llmsTemplate: '# RedactPal\n' }, OPTS);
  const home = built.renderApp(TEMPLATE, built.site.home);
  const pdf = built.renderApp(TEMPLATE, built.site.pages[0]);
  const g1 = built.files.get('guides/g1/index.html')!;

  it('outputs the expected files', () => {
    expect([...built.appPages.keys()]).toEqual(['index.html', 'redact-pdf/index.html']);
    expect([...built.files.keys()].sort()).toEqual(['guides/g1/index.html', 'guides/index.html', 'llms-full.txt', 'llms.txt', 'sitemap.xml']);
    expect(built.files.get('llms-full.txt')).toContain('# Guide one');
  });

  it('fills the template, and fixes asset paths and the app root for sub-folders', () => {
    expect(home).not.toContain('<!--rp:');
    expect(home).toContain('<html lang="en" data-root="./">');
    expect(home).toContain('src="./assets/index-abc.js"');
    expect(pdf).toContain('<html lang="en" data-root="../">');
    expect(pdf).toContain('src="../assets/index-abc.js"');
    expect(pdf).toContain('href="../favicon.svg"');
    expect(pdf).toContain('<div id="app" data-accept="pdf">');
    expect(pdf).toContain('<link rel="canonical" href="https://redactpal.com/redact-pdf/" />');
    expect(home).toContain('<h1 class="start__title" id="start-title" tabindex="-1">Hide it.</h1>');
    expect(home).toContain('<p class="start__lede">Intro with a <a href="./guides/g1/">link</a>.</p>');
    // Footer on every page.
    expect(pdf).toContain('<li><a href="../redact-pdf/">Redact a PDF</a></li>');
    expect(pdf).toContain('Updated <time datetime="2026-11-10">10 November 2026</time>');
  });

  it('writes valid JSON-LD that matches the visible FAQ', () => {
    const ld = ldBlocks(home);
    expect(ld.map((x) => x['@type'])).toEqual(['WebApplication', 'Organization', 'FAQPage']);
    expect(ld[0]).toMatchObject({ softwareVersion: '1.2.3', dateModified: '2026-11-01', sameAs: ['https://github.com/stefano2007517-star/redactpal'] });
    const faq = ld[2] as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    expect(faq.mainEntity).toEqual([{ '@type': 'Question', name: 'Is it free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, free.' } }]);
    expect(home.match(/<details class="faq__item">/g)).toHaveLength(1);
    expect(ldBlocks(pdf).map((x) => x['@type'])).toEqual(['WebPage', 'BreadcrumbList']);
  });

  it('renders guides as static articles with Article, BreadcrumbList, FAQPage and HowTo', () => {
    expect(g1).not.toContain('<script type="module"');
    expect(g1).toContain('<link rel="stylesheet" href="../../assets/site-x.css" />');
    expect(g1).toContain('Published <time datetime="2026-10-01">1 October 2026</time> · Updated <time datetime="2026-11-12">12 November 2026</time>');
    expect(g1).toContain('<nav class="toc"'); // four H2s → automatic table of contents
    expect(g1).toMatch(/<h2 id="two">Two<\/h2>\s*<aside class="cta"/); // placed at <!-- cta -->
    expect(g1).toContain('href="../../redact-pdf/">Redact a PDF</a></aside>');
    const ld = ldBlocks(g1);
    expect(ld.map((x) => x['@type'])).toEqual(['Article', 'BreadcrumbList', 'FAQPage', 'HowTo']);
    expect(ld[0]).toMatchObject({ headline: 'Guide one', datePublished: '2026-10-01', dateModified: '2026-11-12' });
    expect((ld[1] as { itemListElement: unknown[] }).itemListElement).toHaveLength(3);
    expect((ld[3] as { step: unknown[] }).step).toHaveLength(2);
    const index = built.files.get('guides/index.html')!;
    expect(index).toContain('href="../guides/g1/"');
    expect(index).not.toContain('g2'); // draft
    expect(ldBlocks(index).map((x) => x['@type'])).toEqual(['CollectionPage', 'BreadcrumbList']);
  });

  it('escapes content so it cannot break out of a JSON-LD block', () => {
    expect(jsonLd({ a: '</script><script>x' })).toBe('<script type="application/ld+json">{"a":"\\u003c/script>\\u003cscript>x"}</script>');
    expect(formatDate('2026-03-09')).toBe('9 March 2026');
  });
});

describe('shipped content', () => {
  const read = (dir: string): SourceFile[] =>
    (readdirSync(root(`content/${dir}`)) as string[])
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ path: `${dir}/${f}`, text: readFileSync(root(`content/${dir}/${f}`), 'utf8') as string }));
  const files = [...read('pages'), ...read('guides')];
  const warnings: string[] = [];
  const built = buildSite({ files, llmsTemplate: readFileSync(root('content/llms.txt'), 'utf8') }, { ...OPTS, warn: (w) => warnings.push(w) });
  const template = (readFileSync(root('index.html'), 'utf8') as string).replace('src="/src/main.ts"', 'src="./assets/x.js"');

  it('builds without warnings', () => {
    for (const [, p] of built.appPages) built.renderApp(template, p);
    expect(warnings).toEqual([]);
  });
  it('keeps titles and descriptions within search-result limits', () => {
    for (const e of built.site.entries) {
      expect(e.title.length, e.source).toBeLessThanOrEqual(60);
      expect(e.description.length, e.source).toBeLessThanOrEqual(155);
    }
  });
  it('does not claim the home page finds names by itself', () => {
    expect(built.site.home.description).not.toMatch(/\bnames?\b/i);
  });
  it('includes the sample landing page and guide', () => {
    expect(built.appPages.has('redact-pdf/index.html')).toBe(true);
    expect(built.files.has('guides/can-blurred-text-be-unblurred/index.html')).toBe(true);
    for (const [, p] of built.appPages) ldBlocks(built.renderApp(template, p));
    for (const [f, html] of built.files) if (f.endsWith('.html')) ldBlocks(html);
  });
  it('uses the same Content-Security-Policy as index.html', () => {
    expect(template).toContain(`<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  });
});

describe('app presets', () => {
  it('reads data-mode / data-accept with safe fallbacks', () => {
    expect(readPreset(undefined)).toEqual({ mode: 'start', accept: 'any' });
    expect(readPreset({ mode: 'text', accept: 'pdf' })).toEqual({ mode: 'text', accept: 'pdf' });
    expect(readPreset({ mode: 'video', accept: 'docx' })).toEqual({ mode: 'start', accept: 'any' });
  });
  it('words the drop zone for the preset', () => {
    expect(dropzoneCopy('any', false, 'Ctrl+V')).toEqual({
      button: 'Choose a file',
      title: 'Paste (Ctrl+V) or drop a screenshot, photo or PDF',
      pickerAccept: 'image/*,application/pdf,.pdf',
    });
    expect(dropzoneCopy('pdf', true, '⌘V')).toMatchObject({ button: 'Choose a PDF', pickerAccept: 'application/pdf,.pdf' });
    expect(dropzoneCopy('image', false, '⌘V').title).toBe('Paste (⌘V) or drop a screenshot or photo');
  });
  it('resolves the app root from data-root', () => {
    expect(appRootUrl('https://redactpal.com/redact-pdf/', '../')).toBe('https://redactpal.com/');
    expect(appRootUrl('https://intranet.example/tools/redact/', './')).toBe('https://intranet.example/tools/redact/');
    expect(appRootUrl('https://intranet.example/tools/redact/guides/x/', '../../')).toBe('https://intranet.example/tools/redact/');
  });
});
