// Blot service worker: keeps the app's own files so it works offline. Same-origin GETs only;
// it never sees your files (they are never fetched — they are read locally by the page).
const CACHE = 'blot-v2';
const MATCH = { ignoreVary: true };

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => typeof u === 'string' && new URL(u).origin === self.location.origin)
          .map((u) => cache.add(u).catch(() => undefined)),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pages: network first so updates arrive, cache when offline.
      if (req.mode === 'navigate') {
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req, MATCH)) || (await cache.match('./', MATCH)) || (await cache.match('./index.html', MATCH)) || Response.error();
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
