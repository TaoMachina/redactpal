// Content build entry point (pure; see vite-plugin.ts for the file IO and Vite wiring).
//
//   content/pages/index.md      → /                (the app + static copy, FAQ, footer)
//   content/pages/<slug>.md     → /<slug>/         (the app with a preset + static copy)
//   content/guides/<slug>.md    → /guides/<slug>/  (static article, no script)
//                                 /guides/          (index of guides)
//   sitemap.xml, llms.txt, llms-full.txt
import { loadSite, outputFile, type PageEntry, type Site, type SourceFile } from './model.ts';
import { renderLlms, renderLlmsFull, renderSitemap } from './outputs.ts';
import { renderAppPage, renderGuide, renderGuidesIndex, type StaticRenderOpts } from './templates.ts';

export * from './model.ts';
export { renderMarkdown, renderInline, slugify, htmlToText } from './markdown.ts';
export { renderSitemap, sitemapEntries, renderLlms, renderLlmsFull, llmsLinks } from './outputs.ts';
export { renderAppPage, renderGuide, renderGuidesIndex, jsonLd, formatDate, CSP } from './templates.ts';

export interface BuildInput {
  files: SourceFile[];
  /** content/llms.txt (hand-written top part of llms.txt). */
  llmsTemplate: string;
  includeDrafts?: boolean;
}

export interface BuiltSite {
  site: Site;
  /** App pages by output file ("index.html", "redact-pdf/index.html"); render with the built index.html. */
  appPages: Map<string, PageEntry>;
  renderApp(template: string, page: PageEntry): string;
  /** Everything else by output file: guides, guides index, sitemap.xml, llms.txt, llms-full.txt. */
  files: Map<string, string>;
}

export function buildSite(input: BuildInput, o: StaticRenderOpts): BuiltSite {
  const site = loadSite(input.files, { includeDrafts: input.includeDrafts, warn: o.warn });
  const appPages = new Map<string, PageEntry>([site.home, ...site.pages].map((p) => [outputFile(p.url), p]));
  const files = new Map<string, string>();
  for (const g of site.guides) files.set(outputFile(g.url), renderGuide(site, g, o));
  files.set('guides/index.html', renderGuidesIndex(site, o));
  files.set('sitemap.xml', renderSitemap(site));
  files.set('llms.txt', renderLlms(input.llmsTemplate, site));
  files.set('llms-full.txt', renderLlmsFull(site));
  return { site, appPages, renderApp: (template, page) => renderAppPage(template, site, page, o), files };
}
