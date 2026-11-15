import { describe, expect, it } from 'vitest';
import { installOffer, isIosSafari, manualInstallFor } from '../src/ui/install';
import { decodeShared, discardShared, isShareLaunch, sharedText, takeShared, withoutShareParam } from '../src/ui/share';
import { FakeCacheStorage } from './fakecaches';

describe('sharedText', () => {
  it('joins title, text and url, dropping repeats', () => {
    expect(sharedText({ title: 'Notes', text: 'My API key is abc', url: 'https://x.test/a' })).toBe('Notes\nMy API key is abc\nhttps://x.test/a');
    expect(sharedText({ text: 'see https://x.test/a', url: 'https://x.test/a' })).toBe('see https://x.test/a');
    expect(sharedText({ title: 'Page', text: 'Page https://x.test' })).toBe('Page https://x.test');
    expect(sharedText({ title: '  ', text: '', url: undefined })).toBe('');
    expect(sharedText({ title: 5, text: ['x'] })).toBe('');
  });
});

describe('decodeShared', () => {
  it('rebuilds a file with its name and type', async () => {
    const res = new Response(new Uint8Array([7, 8]), {
      headers: { 'content-type': 'application/pdf', 'x-blot-kind': 'file', 'x-blot-name': encodeURIComponent('Bank statement – März.pdf') },
    });
    const item = await decodeShared(res);
    expect(item?.kind).toBe('file');
    if (item?.kind !== 'file') return;
    expect(item.file.name).toBe('Bank statement – März.pdf');
    expect(item.file.type).toBe('application/pdf');
    expect(item.file.size).toBe(2);
  });

  it('falls back to a plain name and an unknown type', async () => {
    const res = new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/octet-stream', 'x-blot-kind': 'file', 'x-blot-name': '%E0%A4%A' } });
    const item = await decodeShared(res);
    expect(item?.kind === 'file' && item.file.name).toBe('shared');
    expect(item?.kind === 'file' && item.file.type).toBe('');
  });

  it('rejects empty files, bad JSON, empty text and unknown kinds', async () => {
    expect(await decodeShared(new Response(new Uint8Array(0), { headers: { 'x-blot-kind': 'file' } }))).toBeNull();
    expect(await decodeShared(new Response('{nope', { headers: { 'x-blot-kind': 'text' } }))).toBeNull();
    expect(await decodeShared(new Response('{"text":"  "}', { headers: { 'x-blot-kind': 'text' } }))).toBeNull();
    expect(await decodeShared(new Response('null', { headers: { 'x-blot-kind': 'text' } }))).toBeNull();
    expect(await decodeShared(new Response('x'))).toBeNull();
  });
});

describe('share launch URL', () => {
  it('detects ?shared=1 and removes only that parameter', () => {
    expect(isShareLaunch('?shared=1')).toBe(true);
    expect(isShareLaunch('?a=1&shared')).toBe(true);
    expect(isShareLaunch('')).toBe(false);
    expect(withoutShareParam('https://h.test/app/?shared=1')).toBe('/app/');
    expect(withoutShareParam('https://h.test/app/?x=2&shared=1#main')).toBe('/app/?x=2#main');
  });
});

describe('takeShared / discardShared', () => {
  it('returns null and leaves nothing behind when nothing was parked', async () => {
    const s = new FakeCacheStorage();
    expect(await takeShared(s.asCacheStorage(), 'https://h.test/')).toBeNull();
    expect(await s.keys()).toEqual([]);
    expect(await takeShared(null)).toBeNull();
  });

  it('deletes the share cache even when the parked entry is unreadable', async () => {
    const s = new FakeCacheStorage();
    const c = await s.open('blot-share');
    await c.put('https://h.test/__shared', new Response('garbage', { headers: { 'x-blot-kind': 'text' } }));
    await s.open('blot-v2');
    expect(await takeShared(s.asCacheStorage(), 'https://h.test/?shared=1')).toBeNull();
    expect(await s.keys()).toEqual(['blot-v2']);
  });

  it('discardShared drops a stale share and nothing else', async () => {
    const s = new FakeCacheStorage();
    await s.open('blot-share');
    await s.open('blot-v2');
    await discardShared(s.asCacheStorage());
    expect(await s.keys()).toEqual(['blot-v2']);
    await discardShared(null);
  });
});

describe('install offer', () => {
  const IPHONE_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const IPHONE_CHROME =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
  const IPHONE_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const IPHONE_FB =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0] Version/18.1 Safari/604.1';
  const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

  it('recognises Safari on iPhone and iPad only', () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 5)).toBe(true);
    expect(isIosSafari(IPAD_DESKTOP, 0)).toBe(false); // a real Mac
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_WEBVIEW, 5)).toBe(false);
    expect(isIosSafari(IPHONE_FB, 5)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });

  it('gives every iPhone browser its own home-screen route; nothing for in-app views', () => {
    const ua = (os: string, tail: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}`;
    expect(manualInstallFor(IPHONE_SAFARI, 5)).toBe('ios-safari');
    expect(manualInstallFor(IPHONE_CHROME, 5)).toBe('ios-chrome');
    expect(manualInstallFor(ua('18_1', 'EdgiOS/131.0 Version/18.0 Mobile/15E148 Safari/604.1'), 5)).toBe('ios-edge');
    expect(manualInstallFor(ua('18_1', 'FxiOS/133.0 Mobile/15E148 Safari/605.1.15'), 5)).toBe('ios-firefox');
    expect(manualInstallFor(ua('16_3', 'CriOS/120.0 Mobile/15E148 Safari/604.1'), 5)).toBeNull(); // before iOS 16.4
    expect(manualInstallFor(IPHONE_WEBVIEW, 5)).toBeNull();
    expect(manualInstallFor(IPHONE_FB, 5)).toBeNull();
    expect(manualInstallFor(ANDROID_CHROME, 5)).toBeNull(); // has the install prompt instead
    expect(manualInstallFor('Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0', 5)).toBe('android-firefox');
    expect(manualInstallFor(IPAD_DESKTOP, 0)).toBe('mac-safari'); // Safari 18 on a real Mac
  });

  it('offers nothing when installed, the prompt when the browser allows it, else the manual route', () => {
    expect(installOffer({ standalone: true, canPrompt: true, manual: 'ios-safari' })).toBeNull();
    expect(installOffer({ standalone: false, canPrompt: true, manual: null })).toBe('prompt');
    expect(installOffer({ standalone: false, canPrompt: false, manual: 'ios-chrome' })).toBe('ios-chrome');
    expect(installOffer({ standalone: false, canPrompt: false, manual: null })).toBeNull();
  });
});
