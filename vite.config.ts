import { defineConfig, type Plugin } from 'vite';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
      const skip = (f: string) =>
        f.endsWith('.map') || f === 'sw.js' || f === 'precache.json' || f.includes('/LICENSES/') || f.endsWith('.txt');
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
  plugins: [precacheManifest()],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
