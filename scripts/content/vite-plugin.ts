// Vite wiring for the content build (build time only; nothing here ships to the browser).
//
// Why a plugin instead of Vite multi-page inputs: every app page is the same app bundle, so the
// built index.html is used as the template and each landing page is that file with its own head,
// pre-rendered intro and static copy. One set of hashed assets, no generated HTML in the repo, and
// the dev server renders the same pages on the fly. Guides need no bundle at all: they are static
// HTML plus one stylesheet (src/ui/base.css + src/ui/site.css, emitted as assets/site-<hash>.css).
//
// Not type-checked by `tsc` (like vite.config.ts: there are no Node types in this project).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildSite, type BuiltSite } from './index.ts';

interface Options {
  root: string;
  version: string;
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

/** Width/height from a PNG, GIF, JPEG or WebP header (or an SVG's width/height attributes). */
export function imageDimensions(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return undefined;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048));
  if (/<svg[\s>]/.test(head)) {
    const w = /<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/.exec(head);
    const h = /<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/.exec(head);
    if (w && h) return { width: Math.round(+w[1]), height: Math.round(+h[1]) };
  }
  return undefined;
}

/** Comments out, indentation and blank lines gone. Good enough for our own hand-written CSS. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}');
}

export function contentPlugin(o: Options): Plugin {
  const contentDir = resolve(o.root, 'content');
  const imgDir = join(contentDir, 'guides', 'img');
  let outDir = 'dist';
  let template: string | null = null;
  let isBuild = false;
  const warned = new Set<string>();
  const warn = (msg: string) => {
    if (warned.has(msg)) return;
    warned.add(msg);
    console.warn(`[content] ${msg}`);
  };

  const readDir = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')) : []);
  const imageSize = (name: string) => {
    const p = join(imgDir, name);
    if (!existsSync(p)) return undefined;
    return imageDimensions(readFileSync(p)) ?? { width: 0, height: 0 };
  };
  const siteCss = () => minifyCss(['base.css', 'site.css'].map((f) => readFileSync(resolve(o.root, 'src', 'ui', f), 'utf8')).join('\n'));
  const cssName = (css: string) => `assets/site-${createHash('sha256').update(css).digest('hex').slice(0, 8)}.css`;

  function load(cssHref: string): BuiltSite {
    const files = [
      ...readDir(join(contentDir, 'pages')).map((f) => ({ path: `pages/${f}`, text: readFileSync(join(contentDir, 'pages', f), 'utf8') })),
      ...readDir(join(contentDir, 'guides')).map((f) => ({ path: `guides/${f}`, text: readFileSync(join(contentDir, 'guides', f), 'utf8') })),
    ];
    const llmsPath = join(contentDir, 'llms.txt');
    return buildSite(
      { files, llmsTemplate: existsSync(llmsPath) ? readFileSync(llmsPath, 'utf8') : '# RedactPal\n', includeDrafts: !isBuild },
      { version: o.version, cssHref, imageSize, warn },
    );
  }

  function devMiddleware(server: ViteDevServer) {
    server.watcher.add(contentDir);
    const reload = (file: string) => {
      if (resolve(file).startsWith(contentDir) || /src[\\/]ui[\\/](base|site)\.css$/.test(file)) server.ws.send({ type: 'full-reload' });
    };
    server.watcher.on('change', reload);
    server.watcher.on('add', reload);
    server.watcher.on('unlink', reload);

    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      try {
        if (path === '/__content/site.css') {
          res.setHeader('content-type', 'text/css; charset=utf-8');
          return res.end(siteCss());
        }
        if (path.startsWith('/guides/img/')) {
          const p = join(imgDir, path.slice('/guides/img/'.length));
          if (!p.startsWith(imgDir) || !existsSync(p)) return next();
          res.setHeader('content-type', MIME[p.slice(p.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream');
          return res.end(readFileSync(p));
        }
        const built = load('/__content/site.css');
        const key = path === '/guides' ? 'guides/index.html' : path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
        if (path.startsWith('/guides') || ['sitemap.xml', 'llms.txt', 'llms-full.txt'].includes(key)) {
          const body = built.files.get(key);
          if (body === undefined) return next();
          res.setHeader('content-type', key.endsWith('.html') ? 'text/html; charset=utf-8' : key.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8');
          return res.end(body);
        }
      } catch (e) {
        res.statusCode = 500;
        return res.end(String((e as Error).message));
      }
      next();
    });
  }

  return {
    name: 'redactpal-content',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
      isBuild = c.command === 'build';
    },
    configureServer(server) {
      devMiddleware(server);
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // `html` is index.html after Vite injected the hashed bundle tags: keep it as the template.
        template = html;
        const built = load('/__content/site.css');
        let page = built.site.home;
        if (!isBuild && ctx.originalUrl) {
          const path = ctx.originalUrl.split('?')[0];
          page = built.appPages.get(`${path.replace(/^\//, '').replace(/([^/])$/, '$1/')}index.html`) ?? page;
        }
        return built.renderApp(html, page);
      },
    },
    closeBundle() {
      if (!isBuild) return;
      if (!template) throw new Error('[content] index.html was never transformed; cannot render landing pages');
      const css = siteCss();
      const cssFile = cssName(css);
      const built = load(`/${cssFile}`);
      const write = (rel: string, body: string | Buffer) => {
        const p = join(outDir, rel);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, body);
      };
      write(cssFile, css);
      for (const [file, page] of built.appPages) if (file !== 'index.html') write(file, built.renderApp(template, page));
      for (const [file, body] of built.files) write(file, body);
      if (existsSync(imgDir)) {
        for (const f of readdirSync(imgDir)) {
          const src = join(imgDir, f);
          if (statSync(src).isFile()) {
            mkdirSync(join(outDir, 'guides', 'img'), { recursive: true });
            copyFileSync(src, join(outDir, 'guides', 'img', f));
          }
        }
      }
      const n = built.appPages.size + built.site.guides.length + 1;
      console.log(`[content] ${n} pages (${built.appPages.size} app, ${built.site.guides.length} guides + index), sitemap.xml, llms.txt, llms-full.txt`);
    },
  };
}
