// RedactPal service worker: keeps the app's own files so it works offline. Same-origin GETs only;
// it never sees your files (they are read locally by the page) — with one exception: a photo or PDF
// shared to the installed app from Android's share sheet arrives here as a POST. It is parked in its
// own cache ('blot-share') just long enough for the page to pick it up, and the page deletes it
// as soon as it has read it. Nothing from a share is stored anywhere else.
//
// Plain script (no build step). Top-level functions are pure where possible; tests/sw.test.ts runs
// this file in a sandbox with fake caches.
const CACHE = 'blot-v2';
const SHARE_CACHE = 'blot-share';
const MATCH = { ignoreVary: true };

/** URL inside this worker's scope (the folder the app is served from). */
function scoped(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key !== SHARE_CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page posts URLs to keep: first what it just loaded, then the full precache list
// (`prune: true`), after which anything else in the cache — old hashed assets from earlier
// versions — is deleted.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache' || !Array.isArray(data.urls)) return;
  event.waitUntil(precache(data));
});

async function precache(data) {
  const urls = sameOrigin(data.urls, self.location.origin);
  const cache = await caches.open(CACHE);
  const ok = await Promise.all(
    urls.map(async (u) => {
      try {
        // Already cached: hashed files never change, and the rest is refreshed by fetch() below
        // whenever it is used online — no need to download it all again on every visit.
        if (!(await cache.match(u, MATCH))) await cache.add(u);
        return true;
      } catch {
        return false;
      }
    }),
  );
  // Only prune once the new list is safely in the cache (never while offline or half-done).
  if (!data.prune || urls.length === 0 || !ok.every(Boolean)) return;
  const keep = [...urls, scoped('./'), ...(Array.isArray(data.keep) ? sameOrigin(data.keep, self.location.origin) : [])];
  if (typeof data.page === 'string') {
    keep.push(data.page);
    try {
      const p = new URL(data.page);
      keep.push(p.origin + p.pathname); // how fetch() below stores pages
    } catch {
      /* ignore */
    }
  }
  const cached = (await cache.keys()).map((r) => r.url);
  await Promise.all(staleEntries(cached, keep, self.location.origin).map((u) => cache.delete(u, MATCH)));
}

/** Absolute same-origin URLs from an untrusted list (anything else is dropped). */
function sameOrigin(list, origin) {
  const out = [];
  for (const u of list) {
    if (typeof u !== 'string') continue;
    try {
      if (new URL(u).origin === origin) out.push(u);
    } catch {
      /* not an absolute URL */
    }
  }
  return out;
}

/** Cached same-origin URLs that are not in `keep` (fragments ignored): safe to delete. */
function staleEntries(cached, keep, origin) {
  const norm = (u) => {
    try {
      const x = new URL(u);
      x.hash = '';
      return x;
    } catch {
      return null;
    }
  };
  const keepSet = new Set();
  for (const k of keep) {
    const x = norm(k);
    if (x) keepSet.add(x.href);
  }
  return cached.filter((u) => {
    const x = norm(u);
    return x !== null && x.origin === origin && !keepSet.has(x.href);
  });
}

/**
 * What to park from a share-target form: the first non-empty file, else the title/text/url fields
 * (decoded by the page, see src/ui/share.ts). Null when the share carried nothing usable.
 */
function shareEntry(form) {
  const file = form.getAll('file').find((f) => typeof f !== 'string' && f && f.size > 0);
  if (file) {
    const type = /^[\x20-\x7e]*$/.test(file.type || '') && file.type ? file.type : 'application/octet-stream';
    return {
      body: file,
      headers: { 'content-type': type, 'x-blot-kind': 'file', 'x-blot-name': encodeURIComponent(file.name || '') },
    };
  }
  const field = (k) => {
    const v = form.get(k);
    return typeof v === 'string' ? v : '';
  };
  const fields = { title: field('title'), text: field('text'), url: field('url') };
  if (!fields.title.trim() && !fields.text.trim() && !fields.url.trim()) return null;
  return { body: JSON.stringify(fields), headers: { 'content-type': 'application/json', 'x-blot-kind': 'text' } };
}

async function receiveShare(req) {
  try {
    const form = await req.formData();
    const entry = shareEntry(form);
    const stash = await caches.open(SHARE_CACHE);
    // One share at a time: forget any earlier one that was never opened.
    for (const k of await stash.keys()) await stash.delete(k);
    if (entry) await stash.put(scoped('./__shared'), new Response(entry.body, { headers: entry.headers }));
  } catch {
    /* nothing parked: the page just shows the start screen */
  }
  return Response.redirect(scoped('./?shared=1'), 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === 'POST' && url.origin + url.pathname === scoped('./share-target')) {
    event.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  // The precache list must always be fresh, and only matters online: never cached.
  if (url.origin + url.pathname === scoped('./precache.json')) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pages: network first so updates arrive, cache when offline. Stored without the query string
      // (e.g. ?shared=1): it is the same page.
      if (req.mode === 'navigate') {
        const key = url.origin + url.pathname;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(key, res.clone());
          return res;
        } catch {
          return (
            (await cache.match(key, MATCH)) ||
            (await cache.match(scoped('./'), MATCH)) ||
            (await cache.match(scoped('./index.html'), MATCH)) ||
            Response.error()
          );
        }
      }
      // Hashed build assets never change: cache first.
      const hit = await cache.match(req, MATCH);
      if (hit && url.pathname.includes('/assets/')) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })(),
  );
});
