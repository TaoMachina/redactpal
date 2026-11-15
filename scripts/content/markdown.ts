// Markdown → HTML for content pages (marked, GFM). Adds heading ids (and collects a table of
// contents), rewrites site-internal links and img/ images to relative URLs, lazy-loads images and
// wraps tables so they scroll sideways on phones instead of widening the page.
import { Marked, type Tokens } from 'marked';
import { relHref } from './model.ts';

export interface RenderContext {
  /** Site path of the page being rendered (relative links are computed from here). */
  from: string;
  /** Known site paths ("/", "/redact-pdf/", "/guides/x/"…) for broken-link warnings. */
  known?: Set<string>;
  /** Pixel size of content/guides/img/<name> (avoids layout shift): undefined = missing, 0×0 = unknown format. */
  imageSize?: (name: string) => { width: number; height: number } | undefined;
  warn?: (msg: string) => void;
}

export interface TocItem {
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  toc: TocItem[];
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML → plain text (for JSON-LD, ids and reading time). Content is our own, so this is enough. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Where a content image ends up: content/guides/img/<name> → /guides/img/<name>. */
export function imagePath(src: string): string | null {
  const m = /^(?:\.\/)?img\/([^?#]+)$/.exec(src) ?? /^\/guides\/img\/([^?#]+)$/.exec(src);
  return m ? m[1] : null;
}

/** Resolve a link written in content (absolute site path, img/…, or external) for the page at ctx.from. */
export function resolveHref(href: string, ctx: RenderContext): string {
  const img = imagePath(href);
  if (img) return relHref(ctx.from, `/guides/img/${img}`);
  if (href.startsWith('/') && !href.startsWith('//')) {
    const path = href.replace(/[?#].*$/, '');
    if (ctx.known && path.endsWith('/') && !ctx.known.has(path)) ctx.warn?.(`${ctx.from}: link to unknown page ${path}`);
    return relHref(ctx.from, href);
  }
  return href;
}

function makeMarked(ctx: RenderContext, toc: TocItem[]): Marked {
  const ids = new Set<string>();
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 1) ctx.warn?.(`${ctx.from}: use ## headings in the body (the page title is the H1)`);
        if (token.depth > 3) return `<h${token.depth}>${inner}</h${token.depth}>\n`;
        const text = htmlToText(inner);
        let id = slugify(text);
        for (let i = 2; ids.has(id); i++) id = `${slugify(text)}-${i}`;
        ids.add(id);
        if (token.depth === 2) toc.push({ id, text });
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens);
        const href = resolveHref(token.href, ctx);
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        const ext = /^https?:\/\//.test(href) ? ' rel="noopener"' : '';
        return `<a href="${escapeHtml(href)}"${title}${ext}>${inner}</a>`;
      },
      image(token: Tokens.Image) {
        const name = imagePath(token.href);
        const src = resolveHref(token.href, ctx);
        const size = name ? ctx.imageSize?.(name) : undefined;
        if (name && ctx.imageSize && !size) ctx.warn?.(`${ctx.from}: image img/${name} not found in content/guides/img/`);
        const dims = size?.width ? ` width="${size.width}" height="${size.height}"` : '';
        const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}"${dims} loading="lazy" decoding="async">`;
        // A title ("caption") turns the image into a figure with a visible caption.
        return token.title ? `<figure>${img}<figcaption>${escapeHtml(token.title)}</figcaption></figure>` : img;
      },
    },
  });
  return md;
}

/** Block Markdown → HTML plus the H2 table of contents. */
export function renderMarkdown(src: string, ctx: RenderContext): Rendered {
  const toc: TocItem[] = [];
  const html = (makeMarked(ctx, toc).parse(src, { async: false }) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    // An image with a caption on its own line is a figure, which may not sit inside a <p>.
    .replace(/<p>(<figure>(?:(?!<\/p>)[\s\S])*?<\/figure>)<\/p>/g, '$1');
  return { html, toc };
}

/** One line of Markdown (intro, CTA text) → inline HTML. */
export function renderInline(src: string, ctx: RenderContext): string {
  return makeMarked(ctx, []).parseInline(src, { async: false }) as string;
}

/** Words in a Markdown body (for "N min read"). */
export function wordCount(src: string): number {
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]()!-]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w)).length;
}
