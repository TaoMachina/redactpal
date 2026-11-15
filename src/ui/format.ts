// Small pure helpers: file classification, filenames, grouping regions for the findings list, copy.
import type { Region } from '../core/types';
import { kindInfo } from './kinds';

export type InputKind = 'image' | 'pdf' | 'text' | 'unsupported';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|tiff?)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|log|json|env|ya?ml|toml|ini|conf|cfg|xml|html?|sql|sh)$/i;

export function classifyFile(f: { type?: string; name?: string }): InputKind {
  const type = (f.type || '').toLowerCase();
  const name = f.name || '';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (type === 'image/svg+xml' || /\.svg$/i.test(name)) return 'unsupported';
  if (type.startsWith('image/') || (!type && IMAGE_EXT.test(name))) return 'image';
  if (type.startsWith('text/') || type === 'application/json' || TEXT_EXT.test(name) || /(^|[\\/])\.env(\.|$)/.test(name)) return 'text';
  return 'unsupported';
}

export function unsupportedMessage(f: { type?: string; name?: string }): string {
  if ((f.type || '').toLowerCase() === 'image/svg+xml' || /\.svg$/i.test(f.name || ''))
    return 'SVG files can hide text that isn’t visible. Take a screenshot of it and drop that instead.';
  return 'Redactly works with screenshots and photos (PNG, JPG, WebP), PDFs, and plain text.';
}

/** "Screenshot 2024-05-01.png" -> "Screenshot 2024-05-01-redacted.png". */
export function redactedFilename(original: string | undefined, ext: 'png' | 'pdf'): string {
  let base = (original || '').split(/[\\/]/).pop() || '';
  base = base.replace(/\.[a-z0-9]{1,5}$/i, '');
  base = base.replace(/[\u0000-\u001f<>:"|?*]+/g, '').trim();
  if (!base) base = 'blot';
  if (base.length > 80) base = base.slice(0, 80);
  return `${base}-redacted.${ext}`;
}

/** Comma / newline separated list -> unique, trimmed terms (case-insensitive dedupe, min 2 chars). */
export function parseTerms(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n;]/)) {
    const t = raw.trim();
    if (t.length < 2) continue;
    const k = t.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export interface PlacedRegion {
  page: number;
  region: Region;
}

/** One row in the findings list: a finding (possibly several boxes) or one manual box. */
export interface FindingItem {
  key: string;
  page: number;
  kind: string;
  label: string;
  text: string;
  regionIds: string[];
  enabled: boolean;
}

export interface FindingGroup {
  /** Unique per group: the kind, or `custom:<term>` (each custom term is its own group). */
  key: string;
  kind: string;
  title: string;
  /** For custom groups: the term (so the list can offer "Stop hiding … everywhere"). */
  term?: string;
  items: FindingItem[];
}

const CUSTOM_PREFIX = 'Custom: ';

/** The term behind a custom finding's label ("Custom: Maria Lopez" → "Maria Lopez"), see detect(). */
export const customTermOf = (label: string): string => (label.startsWith(CUSTOM_PREFIX) ? label.slice(CUSTOM_PREFIX.length) : label);

export const itemKey = (page: number, r: Pick<Region, 'id' | 'findingId'>): string => `${page}:${r.findingId ?? r.id}`;

export function groupRegions(placed: readonly PlacedRegion[]): FindingGroup[] {
  const items = new Map<string, FindingItem>();
  for (const { page, region } of placed) {
    const key = itemKey(page, region);
    const it = items.get(key);
    if (it) {
      it.regionIds.push(region.id);
      it.enabled = it.enabled || region.enabled;
    } else {
      items.set(key, {
        key,
        page,
        kind: region.kind,
        label: region.label,
        text: region.text,
        regionIds: [region.id],
        enabled: region.enabled,
      });
    }
  }
  const groups = new Map<string, FindingGroup>();
  for (const it of items.values()) {
    const term = it.kind === 'custom' ? customTermOf(it.label) : undefined;
    const key = term !== undefined ? `custom:${term.toLocaleLowerCase()}` : it.kind;
    let g = groups.get(key);
    if (!g) {
      const title = term !== undefined ? `“${term}”` : kindInfo(it.kind).plural;
      groups.set(key, (g = { key, kind: it.kind, title, term, items: [] }));
    }
    g.items.push(it);
  }
  const list = [...groups.values()];
  // Manual boxes always last; the rest keep order of first appearance.
  return [...list.filter((g) => g.kind !== 'manual'), ...list.filter((g) => g.kind === 'manual')];
}

/** Number of distinct things that will be hidden (a wrapped finding counts once). */
export function countHidden(placed: readonly PlacedRegion[]): number {
  const keys = new Set<string>();
  for (const p of placed) if (p.region.enabled) keys.add(itemKey(p.page, p.region));
  return keys.size;
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function doneMessage(hidden: number, type: 'image' | 'pdf'): string {
  const what = hidden === 0 ? 'Nothing hidden' : `${plural(hidden, 'item', 'items')} hidden`;
  const extra = type === 'image' ? 'location data & metadata removed' : 'text layer & metadata removed';
  return `Done — ${what}, ${extra}.`;
}

/** Ctrl+V or ⌘V depending on platform. */
export function pasteShortcut(platform: string): string {
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘V' : 'Ctrl+V';
}
