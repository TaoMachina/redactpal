// public/sw.js is a plain script; run it in a sandbox with a fake `self` and Cache Storage.
// @ts-ignore -- no @types/node in this project; vitest runs in Node
import { readFileSync } from 'node:fs';
// @ts-ignore -- see above
import { fileURLToPath } from 'node:url';
// @ts-ignore -- see above
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { takeShared } from '../src/ui/share';
import { FakeCacheStorage } from './fakecaches';

const SRC = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');
const ORIGIN = 'https://blot.example';
const SCOPE = `${ORIGIN}/app/`;

type Handler = (e: unknown) => void;

function loadSw(opts: { network?: Record<string, string> } = {}) {
  const handlers = new Map<string, Handler>();
  const fetched: string[] = [];
  const fetcher = async (url: string) => {
    fetched.push(url);
    const body = opts.network?.[url];
    if (body === undefined) throw new TypeError('offline');
    return new Response(body);
  };
  const storage = new FakeCacheStorage(fetcher);
  const sandbox: Record<string, unknown> = {
    caches: storage,
    fetch: (req: Request | string) => fetcher(typeof req === 'string' ? req : req.url),
    URL,
    Request,
    Response,
    Headers,
    FormData,
    Blob,
    File,
    console,
  };
  sandbox.self = Object.assign(sandbox, {
    location: new URL(`${SCOPE}sw.js`),
    registration: { scope: SCOPE },
    clients: { claim: async () => undefined },
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: () => undefined,
  });
  createContext(sandbox);
  runInContext(SRC, sandbox);

  const fetchEvent = async (request: Request): Promise<Response | undefined> => {
    let p: Promise<Response> | undefined;
    handlers.get('fetch')!({ request, respondWith: (r: Promise<Response>) => (p = r) });
    return p;
  };
  const message = async (data: unknown) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers.get('message')!({ data, waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const activate = async () => {
    let p: Promise<unknown> = Promise.resolve();
    handlers.get('activate')!({ waitUntil: (x: Promise<unknown>) => (p = x) });
    await p;
  };
  const fn = <T>(name: string) => sandbox[name] as T;
  return { storage, fetchEvent, message, activate, fetched, fn };
}

const sharePost = (form: FormData) => new Request(`${SCOPE}share-target`, { method: 'POST', body: form });

describe('service worker: share target', () => {
  it('parks the first shared file in the share cache and redirects with 303', async () => {
    const sw = loadSw();
    const form = new FormData();
    form.append('title', 'ignored when a file is present');
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'Screenshot 1.png', { type: 'image/png' }));
    form.append('file', new File([new Uint8Array([9])], 'second.png', { type: 'image/png' }));
    const res = await sw.fetchEvent(sharePost(form));
    expect(res?.status).toBe(303);
    expect(res?.headers.get('location')).toBe(`${SCOPE}?shared=1`);

    // Only the share cache holds it — the app cache is untouched.
    expect(await sw.storage.keys()).toEqual(['blot-share']);
    const parked = sw.storage.caches.get('blot-share')!;
    expect([...parked.entries.keys()]).toEqual([`${SCOPE}__shared`]);

    // The page reads it back as the same file, and the share cache is gone afterwards.
    const item = await takeShared(sw.storage.asCacheStorage(), `${SCOPE}?shared=1`);
    expect(item?.kind).toBe('file');
    if (item?.kind !== 'file') return;
    expect(item.file.name).toBe('Screenshot 1.png');
    expect(item.file.type).toBe('image/png');
    expect([...new Uint8Array(await item.file.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(await sw.storage.has('blot-share')).toBe(false);
  });

  it('parks shared text / links when there is no file', async () => {
    const sw = loadSw();
    const form = new FormData();
    form.append('title', 'Release notes');
    form.append('text', 'Release notes https://example.com/x');
    form.append('url', 'https://example.com/x');
    await sw.fetchEvent(sharePost(form));
    const item = await takeShared(sw.storage.asCacheStorage(), SCOPE);
    expect(item).toEqual({ kind: 'text', text: 'Release notes https://example.com/x' });
    expect(await sw.storage.has('blot-share')).toBe(false);
  });

  it('an empty share parks nothing and replaces an older unread one', async () => {
    const sw = loadSw();
    const first = new FormData();
    first.append('text', 'old');
    await sw.fetchEvent(sharePost(first));
    const res = await sw.fetchEvent(sharePost(new FormData()));
    expect(res?.status).toBe(303);
    expect(await takeShared(sw.storage.asCacheStorage(), SCOPE)).toBeNull();
  });

  it('a broken POST still redirects (start screen) instead of failing', async () => {
    const sw = loadSw();
    const res = await sw.fetchEvent(new Request(`${SCOPE}share-target`, { method: 'POST', body: 'not a form' }));
    expect(res?.status).toBe(303);
  });

  it('leaves other POSTs and cross-origin requests to the network', async () => {
    const sw = loadSw();
    expect(await sw.fetchEvent(new Request(`${SCOPE}elsewhere`, { method: 'POST', body: 'x' }))).toBeUndefined();
    expect(await sw.fetchEvent(new Request('https://other.example/app/share-target', { method: 'POST', body: 'x' }))).toBeUndefined();
  });

  it('activation keeps the share cache (the page deletes it after reading)', async () => {
    const sw = loadSw();
    await sw.storage.open('blot-share');
    await sw.storage.open('blot-v1');
    await sw.storage.open('blot-v2');
    await sw.activate();
    expect((await sw.storage.keys()).sort()).toEqual(['blot-share', 'blot-v2']);
  });

  it('never caches precache.json', async () => {
    const sw = loadSw();
    expect(await sw.fetchEvent(new Request(`${SCOPE}precache.json`))).toBeUndefined();
  });
});

describe('service worker: precache and prune', () => {
  const a = (p: string) => `${SCOPE}${p}`;

  it('staleEntries: same-origin entries not kept, fragments ignored', () => {
    const sw = loadSw();
    const staleEntries = sw.fn<(c: string[], k: string[], o: string) => string[]>('staleEntries');
    const cached = [a(''), a('assets/old-1.js'), a('assets/new-2.js'), a('index.html'), a('?shared=1'), 'https://other.example/x'];
    const keep = [a('assets/new-2.js'), a('index.html'), a('#main')];
    expect(staleEntries(cached, keep, ORIGIN)).toEqual([a('assets/old-1.js'), a('?shared=1')]);
  });

  it('prunes old files only after the full list is cached; keeps the page, scope and share cache', async () => {
    const network = { [a('assets/new-2.js')]: 'new', [a('index.html')]: '<html>', [a('icons/icon-192.png')]: 'png' };
    const sw = loadSw({ network });
    const cache = await sw.storage.open('blot-v2');
    await cache.put(a(''), new Response('<html>'));
    await cache.put(a('assets/old-1.js'), new Response('old'));
    await cache.put(a('assets/loaded-by-open-tab.js'), new Response('old but in use'));
    await cache.put(a('index.html'), new Response('<html>'));
    const share = await sw.storage.open('blot-share');
    await share.put(a('__shared'), new Response('user file'));

    await sw.message({
      type: 'cache',
      urls: Object.keys(network),
      prune: true,
      page: a('#main'),
      keep: [a('assets/loaded-by-open-tab.js')],
    });
    expect([...cache.entries.keys()].sort()).toEqual(
      [a(''), a('assets/loaded-by-open-tab.js'), a('assets/new-2.js'), a('icons/icon-192.png'), a('index.html')].sort(),
    );
    // Already-cached files were not downloaded again.
    expect(sw.fetched).not.toContain(a('index.html'));
    // The share cache is never touched by pruning.
    expect(share.entries.size).toBe(1);
  });

  it('does not prune when any file failed to cache (offline / partial)', async () => {
    const sw = loadSw({ network: { [a('assets/new-2.js')]: 'new' } });
    const cache = await sw.storage.open('blot-v2');
    await cache.put(a('assets/old-1.js'), new Response('old'));
    await sw.message({ type: 'cache', urls: [a('assets/new-2.js'), a('assets/missing.js')], prune: true, page: a('') });
    expect(cache.entries.has(a('assets/old-1.js'))).toBe(true);
    expect(cache.entries.has(a('assets/new-2.js'))).toBe(true);
  });

  it('does not prune without `prune` (first message) and ignores foreign URLs', async () => {
    const sw = loadSw({ network: { [a('assets/new-2.js')]: 'new' } });
    const cache = await sw.storage.open('blot-v2');
    await cache.put(a('assets/old-1.js'), new Response('old'));
    await sw.message({ type: 'cache', urls: [a('assets/new-2.js'), 'https://evil.example/x', 42] });
    expect(cache.entries.has(a('assets/old-1.js'))).toBe(true);
    expect(sw.fetched).toEqual([a('assets/new-2.js')]);
  });

  it('an empty list never prunes', async () => {
    const sw = loadSw();
    const cache = await sw.storage.open('blot-v2');
    await cache.put(a('assets/old-1.js'), new Response('old'));
    await sw.message({ type: 'cache', urls: [], prune: true, page: a('') });
    expect(cache.entries.size).toBe(1);
  });
});
