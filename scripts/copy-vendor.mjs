#!/usr/bin/env node
// Copy the OCR runtime into public/vendor/tesseract/ so it is served from our own origin
// (Vite copies public/ into dist/). Runs automatically before `npm run dev` and `npm run build`.
//
//   public/vendor/tesseract/
//     worker.min.js                              tesseract.js worker (classic script)
//     core/tesseract-core-relaxedsimd-lstm.wasm.js  \
//     core/tesseract-core-simd-lstm.wasm.js          > wasm core, embedded single-file builds;
//     core/tesseract-core-lstm.wasm.js              /  tesseract.js picks one by feature detection
//     lang/eng.traineddata.gz                    English LSTM model (tessdata_best, integerised)
//     LICENSES/…                                 Apache-2.0 notices of the above
//
// We run Tesseract in LSTM-only mode (OEM 1), so tesseract.js only ever loads the "-lstm" core
// variants; the legacy-engine cores (≈4.7 MB each) are not shipped. Keep in sync with src/image/assets.ts.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const LANG_DATA_VERSION = '4.0.0_best_int'; // src/image/assets.ts LANG_DATA_VERSION
const out = join(root, 'public', 'vendor', 'tesseract');

const tjs = pkgDir('tesseract.js');
const core = pkgDir('tesseract.js-core');
const eng = pkgDir('@tesseract.js-data/eng');

/** [source, destination relative to `out`, transform?] */
const files = [
  // Strip the sourceMappingURL comment: we don't ship the 340 KB map, and devtools would 404 on it.
  [join(tjs, 'dist', 'worker.min.js'), 'worker.min.js', (buf) => Buffer.from(buf.toString('utf8').replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n'))],
  [join(core, 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'core/tesseract-core-simd-lstm.wasm.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'core/tesseract-core-lstm.wasm.js'],
  [join(eng, LANG_DATA_VERSION, 'eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
  [join(tjs, 'LICENSE.md'), 'LICENSES/tesseract.js-LICENSE.md'],
  [join(core, 'LICENSE'), 'LICENSES/tesseract.js-core-LICENSE'],
];

let copied = 0;
let total = 0;
for (const [src, rel, transform] of files) {
  if (!existsSync(src)) {
    console.error(`[copy-vendor] missing ${relative(root, src)} — run \`npm install\` first.`);
    process.exit(1);
  }
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const s = statSync(src);
  // Skip when up to date (dest newer than src). Transformed files are always rewritten (cheap).
  if (!transform && existsSync(dest)) {
    const d = statSync(dest);
    if (d.size === s.size && d.mtimeMs >= s.mtimeMs) {
      total += d.size;
      continue;
    }
  }
  if (transform) writeFileSync(dest, transform(readFileSync(src)));
  else copyFileSync(src, dest);
  total += statSync(dest).size;
  copied++;
}

writeFileSync(
  join(out, 'LICENSES', 'README.txt'),
  [
    'OCR runtime shipped with RedactPal (served from this origin, never from a CDN):',
    `- tesseract.js ${require('tesseract.js/package.json').version} (Apache-2.0) — worker.min.js`,
    `- tesseract.js-core ${require('tesseract.js-core/package.json').version} (Apache-2.0) — core/*.wasm.js (Tesseract OCR, Leptonica)`,
    `- @tesseract.js-data/eng ${LANG_DATA_VERSION} (Apache-2.0, from tesseract-ocr/tessdata_best) — lang/eng.traineddata.gz`,
    '',
  ].join('\n'),
);

console.log(`[copy-vendor] ${copied} file(s) updated, ${(total / 1048576).toFixed(1)} MB in ${relative(root, out)}`);
