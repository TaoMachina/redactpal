// Where the app's own files (sw.js, precache.json, vendor/…) live. Pages in sub-folders (landing
// pages such as /redact-pdf/) say so with <html data-root="../">, written by the content build;
// without it the page itself is at the root. Resolved against the document, so a self-hosted copy
// in any sub-path keeps working.
export function appRootUrl(base?: string, root?: string): string {
  const doc = typeof document !== 'undefined' ? document : undefined;
  const b = base ?? (doc?.baseURI || (globalThis as { location?: { href: string } }).location?.href || '/');
  const r = root ?? doc?.documentElement?.dataset?.root ?? './';
  return new URL(r || './', b).href;
}
