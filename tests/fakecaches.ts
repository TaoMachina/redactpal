// Minimal in-memory Cache Storage for Node tests (just what public/sw.js and src/ui/share.ts use).

const keyOf = (req: RequestInfo | URL): string => {
  const u = new URL(typeof req === 'string' ? req : req instanceof URL ? req.href : req.url);
  u.hash = '';
  return u.href;
};

export class FakeCache {
  entries = new Map<string, Response>();
  constructor(private fetcher: (url: string) => Promise<Response> = () => Promise.reject(new Error('offline'))) {}
  async match(req: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(keyOf(req))?.clone();
  }
  async put(req: RequestInfo | URL, res: Response): Promise<void> {
    // Like the real thing: the body is stored, so read it now.
    const body = await res.arrayBuffer();
    this.entries.set(keyOf(req), new Response(body, { status: res.status, headers: res.headers }));
  }
  async add(req: RequestInfo | URL): Promise<void> {
    const res = await this.fetcher(keyOf(req));
    if (!res.ok) throw new TypeError('bad status');
    await this.put(req, res);
  }
  async delete(req: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(keyOf(req));
  }
  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
}

export class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  constructor(private fetcher?: (url: string) => Promise<Response>) {}
  async open(name: string): Promise<FakeCache> {
    let c = this.caches.get(name);
    if (!c) this.caches.set(name, (c = new FakeCache(this.fetcher)));
    return c;
  }
  async has(name: string): Promise<boolean> {
    return this.caches.has(name);
  }
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }
  asCacheStorage(): CacheStorage {
    return this as unknown as CacheStorage;
  }
}
