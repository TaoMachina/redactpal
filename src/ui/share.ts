// Receiving a share from Android's share sheet (manifest share_target → public/sw.js).
// The service worker parks the shared file (or text) in its own cache and redirects to ./?shared=1;
// here the page takes it out and deletes it straight away, so nothing stays on disk.

/** Must match public/sw.js. */
export const SHARE_CACHE = 'blot-share';
const SHARE_KEY = './__shared';
const SHARED_PARAM = 'shared';

export type SharedItem = { kind: 'file'; file: File } | { kind: 'text'; text: string };

/** Title / text / URL from a share sheet → one block of text. Duplicates (Android often repeats the URL in "text") are dropped. */
export function sharedText(fields: { title?: unknown; text?: unknown; url?: unknown }): string {
  const parts: string[] = [];
  for (const v of [fields.title, fields.text, fields.url]) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || parts.some((p) => p.includes(t))) continue;
    // A later, longer part that contains an earlier one replaces it ("Title" + "Title https://…").
    for (let i = parts.length - 1; i >= 0; i--) if (t.includes(parts[i])) parts.splice(i, 1);
    parts.push(t);
  }
  return parts.join('\n');
}

/** Turn the parked response back into a file or text. Reads the whole body into memory. */
export async function decodeShared(res: Response): Promise<SharedItem | null> {
  const kind = res.headers.get('x-blot-kind');
  if (kind === 'file') {
    const type = res.headers.get('content-type') || '';
    let name = 'shared';
    try {
      name = decodeURIComponent(res.headers.get('x-blot-name') || '') || name;
    } catch {
      /* keep the default */
    }
    // A copy in memory, independent of the cache entry that is about to be deleted.
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return { kind: 'file', file: new File([buf], name, { type: type === 'application/octet-stream' ? '' : type }) };
  }
  if (kind === 'text') {
    let fields: unknown;
    try {
      fields = JSON.parse(await res.text());
    } catch {
      return null;
    }
    const text = fields && typeof fields === 'object' ? sharedText(fields as Record<string, unknown>) : '';
    return text ? { kind: 'text', text } : null;
  }
  return null;
}

/** Did the service worker just redirect here with a share? */
export const isShareLaunch = (search: string): boolean => new URLSearchParams(search).has(SHARED_PARAM);

/** The current URL without ?shared=1 (other params and the hash kept). */
export function withoutShareParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete(SHARED_PARAM);
  return u.pathname + u.search + u.hash;
}

const storage = (): CacheStorage | null => (typeof caches === 'undefined' ? null : caches);

/**
 * Take the parked share: read it, then delete the share cache whatever happened.
 * Null when nothing was parked (or Cache Storage is unavailable).
 */
export async function takeShared(store: CacheStorage | null = storage(), base?: string): Promise<SharedItem | null> {
  if (!store) return null;
  try {
    if (!(await store.has(SHARE_CACHE))) return null;
    const res = await (await store.open(SHARE_CACHE)).match(new URL(SHARE_KEY, base ?? location.href).href);
    return res ? await decodeShared(res) : null;
  } catch {
    return null;
  } finally {
    await store.delete(SHARE_CACHE).catch(() => false);
  }
}

/** A normal launch: drop any share that was parked but never opened (e.g. the page failed to load). */
export async function discardShared(store: CacheStorage | null = storage()): Promise<void> {
  if (!store) return;
  try {
    await store.delete(SHARE_CACHE);
  } catch {
    /* nothing to do */
  }
}
