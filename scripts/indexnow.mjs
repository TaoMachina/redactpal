// Tell IndexNow-enabled search engines (Bing, Yandex, Seznam, Naver…) that pages changed.
// Bing's index also feeds ChatGPT search and Copilot. Run after a deploy has gone live:
//   node scripts/indexnow.mjs            -> every URL in the live sitemap
//   node scripts/indexnow.mjs /redact-pdf/ /guides/foo/   -> just these paths
// The key is public by design: it is served at https://redactpal.com/<key>.txt.
const HOST = 'redactpal.com';
const KEY = '435729ed96d2961ccfed265dcaaea959';

const paths = process.argv.slice(2);
let urls;
if (paths.length) {
  urls = paths.map((p) => new URL(p, `https://${HOST}`).href);
} else {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const keyCheck = await fetch(`https://${HOST}/${KEY}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) {
  console.error('Key file is not live yet — deploy first.');
  process.exit(1);
}

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urls.length} URLs`);
if (res.status >= 300) console.log(await res.text());
