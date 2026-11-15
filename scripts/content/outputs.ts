// Machine-readable outputs: sitemap.xml, llms.txt (template + generated "Links" section) and
// llms-full.txt (plain-text copy of every landing page and guide).
import { absoluteUrl, SITE, type Entry, type Site } from './model.ts';
import { GUIDES_INDEX, linkLabel } from './templates.ts';

export interface SitemapEntry {
  loc: string;
  lastmod: string;
}

export function sitemapEntries(site: Site): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  const add = (e: Entry) => {
    if (!e.noindex) out.push({ loc: absoluteUrl(e.url), lastmod: e.updated ?? site.updated });
  };
  add(site.home);
  site.pages.forEach(add);
  const guidesUpdated = site.guides.reduce((m, g) => ((g.updated ?? g.published) > m ? (g.updated ?? g.published) : m), '');
  out.push({ loc: absoluteUrl('/guides/'), lastmod: guidesUpdated || site.updated });
  site.guides.forEach(add);
  return out;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSitemap(site: Site): string {
  const urls = sitemapEntries(site)
    .map((u) => `  <url><loc>${xml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Markdown links/images written for the site (/path, img/x.png) → absolute URLs for plain-text readers. */
export function absolutizeMarkdown(md: string): string {
  return md
    .replace(/\]\((?:\.\/)?img\//g, `](${SITE.origin}/guides/img/`)
    .replace(/\]\(\/(?!\/)/g, `](${SITE.origin}/`)
    .replace(/<!--[\s\S]*?-->\n?/g, '');
}

/** The "## Links" section of llms.txt, generated from the content. */
export function llmsLinks(site: Site): string {
  const line = (title: string, url: string, note: string) => `- [${title}](${url}): ${note}`;
  const lines = [
    '## Links',
    '',
    line('RedactPal', `${SITE.origin}/`, 'the tool (screenshots, photos, PDFs and text), with a short explanation and an FAQ.'),
    ...site.pages.filter((p) => !p.noindex).map((p) => line(linkLabel(p), absoluteUrl(p.url), p.description)),
    line(GUIDES_INDEX.h1, absoluteUrl('/guides/'), 'index of all guides.'),
    ...site.guides.filter((g) => !g.noindex).map((g) => line(linkLabel(g), absoluteUrl(g.url), g.description)),
    line('Full text', `${SITE.origin}/llms-full.txt`, 'every page and guide above as one plain-text file.'),
    line('Source code and README', SITE.github, 'MIT license, architecture, self-hosting instructions.'),
    line('Architecture', `${SITE.github}/blob/main/ARCHITECTURE.md`, 'modules, detection rules, security model.'),
  ];
  return lines.join('\n') + '\n';
}

/** llms.txt = the hand-written template with its "## Links" section replaced (or appended). */
export function renderLlms(template: string, site: Site): string {
  const t = template.replace(/\r\n?/g, '\n').trimEnd() + '\n';
  const links = llmsLinks(site);
  const m = /^## Links[ \t]*\n[\s\S]*?(?=^## |(?![\s\S]))/m.exec(t);
  if (!m) return `${t}\n${links}`;
  const after = t.slice(m.index + m[0].length);
  return t.slice(0, m.index) + links + (after ? `\n${after}` : '');
}

function entryText(e: Entry): string {
  const parts = [`# ${e.h1}`, '', `URL: ${absoluteUrl(e.url)}`];
  if (e.kind === 'guide') parts.push(`Published: ${e.published}`);
  if (e.updated) parts.push(`Updated: ${e.updated}`);
  parts.push('', e.description);
  if (e.kind === 'page' && e.intro) parts.push('', absolutizeMarkdown(e.intro));
  if (e.body.trim()) parts.push('', absolutizeMarkdown(e.body.trim()));
  if (e.kind === 'guide' && e.howto) {
    parts.push('', `## ${e.howto.name}`, '');
    e.howto.steps.forEach((s, i) => parts.push(`${i + 1}. ${s.name}. ${absolutizeMarkdown(s.text)}`));
  }
  if (e.faq.length) {
    parts.push('', `## ${e.faqTitle ?? 'Questions'}`);
    for (const f of e.faq) parts.push('', `Q: ${f.q}`, `A: ${absolutizeMarkdown(f.a)}`);
  }
  return parts.join('\n');
}

export function renderLlmsFull(site: Site): string {
  const entries = site.entries.filter((e) => !e.noindex);
  const head = [
    `# ${SITE.name}: full text`,
    '',
    `> Plain-text copy of the pages and guides on ${SITE.origin}, generated when the site is built. Last updated ${site.updated}. Source: ${SITE.github}`,
  ].join('\n');
  return [head, ...entries.map(entryText)].join('\n\n---\n\n') + '\n';
}
