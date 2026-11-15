import { defineConfig, type Plugin } from 'vite';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contentPlugin } from './scripts/content/vite-plugin.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

/** Short commit id shown in the footer (Cloudflare Pages provides it; locally ask git). */
function buildId(): string {
  const sha = process.env.CF_PAGES_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

/**
 * Writes dist/precache.json: every file the app may need, so the service worker can fetch them all
 * on the first visit and "turn off Wi-Fi and it still works" is true from then on.
 * Tesseract ships one core per CPU feature level; those are listed separately so the page can
 * pick the one this device will actually use (see src/main.ts).
 */
function precacheManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'blot-precache-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split('\\').join('/'));
        }
      };
      walk(outDir);
      // Only the app itself: not the content pages (landing pages, guides and their images and
      // stylesheet load normally online; the worker caches a page when it is visited).
      const skip = (f: string) =>
        f.endsWith('.map') ||
        f === 'sw.js' ||
        f === 'precache.json' ||
        f === '_headers' ||
        f.includes('/LICENSES/') ||
        f.endsWith('.txt') ||
        f.endsWith('.xml') ||
        (f.endsWith('.html') && f !== 'index.html') ||
        f.startsWith('guides/') ||
        /^assets\/site-[\w-]+\.css$/.test(f);
      const core = files.filter((f) => f.startsWith('vendor/tesseract/core/'));
      const always = files.filter((f) => !skip(f) && !core.includes(f));
      writeFileSync(join(outDir, 'precache.json'), JSON.stringify({ always, core }, null, 1));
    },
  };
}

// Relative base so the built app works from any static host or sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  worker: { format: 'es' },
  define: { __BUILD__: JSON.stringify(buildId()) },
  plugins: [contentPlugin({ root, version: pkg.version }), precacheManifest()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
