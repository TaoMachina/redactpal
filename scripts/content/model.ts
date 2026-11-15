// Content model: Markdown files with YAML front matter → validated entries with URLs.
// Pure (no Node APIs) so tests can run it directly; file IO lives in scripts/content/vite-plugin.ts.
// The front-matter schema is documented in content/README.md — keep both in sync.
import { parse as parseYaml } from 'yaml';

export const SITE = {
  origin: 'https://redactpal.com',
  name: 'RedactPal',
  github: 'https://github.com/stefano2007517-star/redactpal',
  ogImage: '/og.png',
  ogImageAlt: 'RedactPal: a document with an email, card number, phone number and API key blacked out',
} as const;

export type Mode = 'start' | 'text';
export type Accept = 'any' | 'pdf' | 'image';

export interface Faq {
  q: string;
  a: string;
}

export interface HowTo {
  name: string;
  description?: string;
  steps: { name: string; text: string }[];
}

export interface Cta {
  /** Landing page the box links to: a page slug, or "/" for the home page. */
  tool: string;
  title?: string;
  text?: string;
  button?: string;
}

interface BaseEntry {
  /** content/pages/<slug>.md or content/guides/<slug>.md (for messages). */
  source: string;
  slug: string;
  /** Site path with a trailing slash: "/", "/redact-pdf/", "/guides/foo/". */
  url: string;
  title: string;
  description: string;
  h1: string;
  published?: string;
  updated?: string;
  draft: boolean;
  noindex: boolean;
  /** Social image path (site path or img/<file>); defaults to /og.png. */
  image?: string;
  imageAlt?: string;
  related: string[];
  faq: Faq[];
  faqTitle?: string;
  /** Markdown body (front matter removed). */
  body: string;
}

export interface PageEntry extends BaseEntry {
  kind: 'page';
  intro: string;
  mode: Mode;
  accept: Accept;
  navLabel: string;
  navOrder: number;
}

export interface GuideEntry extends BaseEntry {
  kind: 'guide';
  published: string;
  toc: boolean | 'auto';
  cta: Cta;
  howto?: HowTo;
}

export type Entry = PageEntry | GuideEntry;

export class ContentError extends Error {}

export interface SourceFile {
  /** Path relative to the content folder, with forward slashes: "pages/redact-pdf.md". */
  path: string;
  text: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Top-level folders the app or the build already uses. */
const RESERVED = new Set(['guides', 'assets', 'vendor', 'icons', 'src', 'share-target']);

const COMMON_KEYS = ['title', 'description', 'h1', 'published', 'updated', 'draft', 'noindex', 'image', 'image_alt', 'related', 'faq', 'faq_title'];
const PAGE_KEYS = new Set([...COMMON_KEYS, 'intro', 'mode', 'accept', 'nav_label', 'nav_order']);
const GUIDE_KEYS = new Set([...COMMON_KEYS, 'toc', 'cta', 'howto']);

/** Split `---\nyaml\n---\nbody`. A file without front matter has empty data. */
export function parseFrontMatter(text: string, source = 'input'): { data: Record<string, unknown>; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { data: {}, body: src };
  let data: unknown;
  try {
    data = parseYaml(m[1]) ?? {};
  } catch (e) {
    throw new ContentError(`${source}: invalid front matter: ${(e as Error).message}`);
  }
  if (typeof data !== 'object' || Array.isArray(data)) throw new ContentError(`${source}: front matter must be a key: value map`);
  return { data: data as Record<string, unknown>, body: src.slice(m[0].length) };
}

/** URL path of an entry. "index" in content/pages is the home page. */
export function entryUrl(kind: Entry['kind'], slug: string): string {
  if (kind === 'guide') return `/guides/${slug}/`;
  return slug === 'index' ? '/' : `/${slug}/`;
}

/** Output file in dist/ for a site path ("/" → "index.html", "/a/b/" → "a/b/index.html"). */
export function outputFile(url: string): string {
  return `${url.replace(/^\//, '')}index.html`;
}

export const absoluteUrl = (path: string): string => SITE.origin + path;

/**
 * Relative link from the page at `from` (a site path ending in "/") to the site path `to`, so the
 * built site also works from a sub-folder (self-hosting). Keeps ?query and #hash.
 */
export function relHref(from: string, to: string): string {
  if (!to.startsWith('/') || to.startsWith('//')) return to;
  const depth = from.split('/').filter(Boolean).length;
  const up = depth ? '../'.repeat(depth) : './';
  const rest = to.slice(1);
  return rest ? up + rest : up;
}

/** Normalise a `related` / `cta.tool` reference ("redact-pdf", "/redact-pdf/", "guides/x", "/") to a site path. */
export function refToUrl(ref: string): string {
  const r = ref.trim().replace(/^\/+|\/+$/g, '');
  if (!r || r === 'index') return '/';
  return `/${r}/`;
}

function str(data: Record<string, unknown>, key: string, source: string, required: boolean): string | undefined {
  const v = data[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ContentError(`${source}: "${key}" is required`);
    return undefined;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new ContentError(`${source}: "${key}" must be text`);
  return String(v).trim();
}

function date(data: Record<string, unknown>, key: string, source: string, required: boolean): string | undefined {
  let v = data[key];
  if (v instanceof Date) v = v.toISOString().slice(0, 10);
  const s = str({ [key]: v }, key, source, required);
  if (s === undefined) return undefined;
  if (!DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new ContentError(`${source}: "${key}" must be a date like 2026-11-15`);
  return s;
}

function bool(data: Record<string, unknown>, key: string, source: string, fallback: boolean): boolean {
  const v = data[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'boolean') throw new ContentError(`${source}: "${key}" must be true or false`);
  return v;
}

function oneOf<T extends string>(data: Record<string, unknown>, key: string, source: string, values: readonly T[], fallback: T): T {
  const v = str(data, key, source, false);
  if (v === undefined) return fallback;
  if (!(values as readonly string[]).includes(v)) throw new ContentError(`${source}: "${key}" must be one of ${values.join(', ')}`);
  return v as T;
}

function list(data: Record<string, unknown>, key: string, source: string): unknown[] {
  const v = data[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ContentError(`${source}: "${key}" must be a list`);
  return v;
}

function obj(v: unknown, what: string, source: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ContentError(`${source}: ${what} must be a key: value map`);
  return v as Record<string, unknown>;
}

function faqs(data: Record<string, unknown>, source: string): Faq[] {
  return list(data, 'faq', source).map((item, i) => {
    const o = obj(item, `faq item ${i + 1}`, source);
    return { q: str(o, 'q', `${source} faq ${i + 1}`, true)!, a: str(o, 'a', `${source} faq ${i + 1}`, true)! };
  });
}

/** Parse and validate one source file. `warn` receives non-fatal problems (unknown keys, long titles). */
export function parseEntry(file: SourceFile, warn: (msg: string) => void = () => {}): Entry {
  const m = /^(pages|guides)\/([^/]+)\.md$/.exec(file.path);
  if (!m) throw new ContentError(`${file.path}: content files go in pages/<slug>.md or guides/<slug>.md`);
  const kind = m[1] === 'pages' ? 'page' : 'guide';
  const slug = m[2];
  const source = `content/${file.path}`;
  if (!SLUG.test(slug)) throw new ContentError(`${source}: file name must be a lowercase-hyphenated slug (a-z, 0-9, -)`);
  if (kind === 'page' && RESERVED.has(slug)) throw new ContentError(`${source}: "${slug}" is reserved`);

  const { data, body } = parseFrontMatter(file.text, source);
  const known = kind === 'page' ? PAGE_KEYS : GUIDE_KEYS;
  for (const k of Object.keys(data)) if (!known.has(k)) warn(`${source}: unknown front-matter key "${k}" (ignored)`);

  const title = str(data, 'title', source, true)!;
  const description = str(data, 'description', source, true)!;
  if (title.length > 60) warn(`${source}: title is ${title.length} characters (search results show about 60)`);
  if (description.length > 155) warn(`${source}: description is ${description.length} characters (aim for at most 155)`);

  const published = date(data, 'published', source, kind === 'guide');
  const updated = date(data, 'updated', source, false) ?? published;
  if (published && updated && updated < published) throw new ContentError(`${source}: "updated" is before "published"`);
  const related = list(data, 'related', source).map((r, i) => {
    if (typeof r !== 'string' || !r.trim()) throw new ContentError(`${source}: related item ${i + 1} must be a page or guide path`);
    return refToUrl(r);
  });

  const base = {
    source,
    slug,
    url: entryUrl(kind, slug),
    title,
    description,
    h1: str(data, 'h1', source, false) ?? title,
    published,
    updated,
    draft: bool(data, 'draft', source, false),
    noindex: bool(data, 'noindex', source, false),
    image: str(data, 'image', source, false),
    imageAlt: str(data, 'image_alt', source, false),
    related,
    faq: faqs(data, source),
    faqTitle: str(data, 'faq_title', source, false),
    body,
  };

  if (kind === 'page') {
    const order = data.nav_order;
    if (order !== undefined && typeof order !== 'number') throw new ContentError(`${source}: "nav_order" must be a number`);
    return {
      ...base,
      kind,
      intro: str(data, 'intro', source, false) ?? '',
      mode: oneOf(data, 'mode', source, ['start', 'text'] as const, 'start'),
      accept: oneOf(data, 'accept', source, ['any', 'pdf', 'image'] as const, 'any'),
      navLabel: str(data, 'nav_label', source, false) ?? base.h1,
      navOrder: typeof order === 'number' ? order : 100,
    };
  }

  const tocRaw = data.toc;
  if (tocRaw !== undefined && tocRaw !== null && typeof tocRaw !== 'boolean' && tocRaw !== 'auto')
    throw new ContentError(`${source}: "toc" must be true, false or auto`);
  const ctaRaw = data.cta === undefined || data.cta === null ? {} : obj(data.cta, '"cta"', source);
  const cta: Cta = {
    tool: refToUrl(str(ctaRaw, 'tool', `${source} cta`, false) ?? '/'),
    title: str(ctaRaw, 'title', `${source} cta`, false),
    text: str(ctaRaw, 'text', `${source} cta`, false),
    button: str(ctaRaw, 'button', `${source} cta`, false),
  };
  let howto: HowTo | undefined;
  if (data.howto !== undefined && data.howto !== null) {
    const o = obj(data.howto, '"howto"', source);
    const steps = list(o, 'steps', `${source} howto`).map((s, i) => {
      const so = obj(s, `howto step ${i + 1}`, source);
      return { name: str(so, 'name', `${source} howto step ${i + 1}`, true)!, text: str(so, 'text', `${source} howto step ${i + 1}`, true)! };
    });
    if (!steps.length) throw new ContentError(`${source}: "howto" needs at least one step`);
    howto = { name: str(o, 'name', `${source} howto`, true)!, description: str(o, 'description', `${source} howto`, false), steps };
  }
  return { ...base, kind, published: published!, toc: tocRaw === undefined || tocRaw === null ? 'auto' : (tocRaw as boolean | 'auto'), cta, howto };
}

export interface Site {
  /** Every published entry: home first, then landing pages (nav order), then guides (newest first). */
  entries: Entry[];
  home: PageEntry;
  pages: PageEntry[];
  guides: GuideEntry[];
  /** URL path → entry, plus "/guides/" for the index (mapped to null). */
  urls: Map<string, Entry | null>;
  /** Latest `updated` date across the site. */
  updated: string;
}

/**
 * Load all files into a site. Drafts are dropped unless `includeDrafts` (dev server).
 * Throws ContentError on schema errors; broken internal references are reported to `warn`.
 */
export function loadSite(files: SourceFile[], opts: { includeDrafts?: boolean; warn?: (msg: string) => void } = {}): Site {
  const warn = opts.warn ?? (() => {});
  const all = files.filter((f) => /^(pages|guides)\/[^/]+\.md$/.test(f.path)).map((f) => parseEntry(f, warn));
  const live = all.filter((e) => opts.includeDrafts || !e.draft);
  const home = live.find((e): e is PageEntry => e.kind === 'page' && e.slug === 'index');
  if (!home) throw new ContentError('content/pages/index.md (the home page) is missing or a draft');
  const pages = live
    .filter((e): e is PageEntry => e.kind === 'page' && e !== home)
    .sort((a, b) => a.navOrder - b.navOrder || a.navLabel.localeCompare(b.navLabel));
  const guides = live
    .filter((e): e is GuideEntry => e.kind === 'guide')
    .sort((a, b) => (b.published + b.slug).localeCompare(a.published + a.slug));
  const entries: Entry[] = [home, ...pages, ...guides];
  const urls = new Map<string, Entry | null>(entries.map((e) => [e.url, e]));
  urls.set('/guides/', null);
  const drafts = new Set(all.filter((e) => !live.includes(e)).map((e) => e.url));
  for (const e of entries) {
    const refs = [...e.related, ...(e.kind === 'guide' ? [e.cta.tool] : [])];
    for (const r of refs) {
      if (!urls.has(r)) warn(`${e.source}: links to ${r}, which ${drafts.has(r) ? 'is a draft' : 'does not exist'} (link dropped)`);
    }
    if (e.kind === 'guide' && !urls.has(e.cta.tool)) e.cta = { ...e.cta, tool: '/' };
  }
  const updated = entries.reduce((m, e) => ((e.updated ?? '') > m ? e.updated! : m), '');
  return { entries, home, pages, guides, urls, updated: updated || new Date().toISOString().slice(0, 10) };
}

/** Related links for an entry: its own `related` list (existing only), else sensible defaults. */
export function relatedFor(site: Site, e: Entry, max = 4): Entry[] {
  const own = e.related.map((u) => site.urls.get(u)).filter((x): x is Entry => !!x && x !== e);
  if (own.length) return own.slice(0, max);
  if (e.kind === 'page') {
    // Guides that point readers at this tool first, then the newest guides.
    const mine = site.guides.filter((g) => g.cta.tool === e.url);
    return [...new Set([...mine, ...site.guides])].slice(0, max);
  }
  const tool = site.urls.get(e.cta.tool);
  const others = site.guides.filter((g) => g !== e);
  return [...new Set([...(tool ? [tool] : []), ...others])].slice(0, max);
}
