#!/usr/bin/env node
// Rasterises the app icon (same design as public/favicon.svg: a paper-coloured rounded square with
// two grey "text lines" and one black blot) into the PNGs the web app manifest and iOS need.
// No image libraries: shapes are tested per sub-pixel (8×8 supersampling for anti-aliasing) and the
// PNG is encoded by hand with node:zlib. Run once after changing the design and commit the output:
//
//   node scripts/make-icons.mjs        → public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'icons');

const PAPER = [0xe8, 0xec, 0xf1];
const LINE = [0x8c, 0x9a, 0xad];
const BLOT = [0x00, 0x00, 0x00];

// The favicon's 32-unit design. Bars: [x, y, w, h, radius, colour].
const BARS = [
  [5, 8, 22, 3.5, 1.5, LINE],
  [5, 14, 16, 5.5, 1, BLOT],
  [5, 22, 18, 3.5, 1.5, LINE],
];

/**
 * Shapes for one icon, in 32-unit design space.
 * - tileRadius: corner radius of the background tile (0 = full-bleed square).
 * - scale/center: shrink the bars around their own centre (maskable icons keep them in the safe zone).
 */
function design({ tileRadius, scale = 1, recenter = false }) {
  const shapes = [{ x: 0, y: 0, w: 32, h: 32, r: tileRadius, c: PAPER }];
  // Bounding box of the bars: x 5..27, y 8..25.5.
  const cx = 16;
  const cy = recenter ? (8 + 25.5) / 2 : 16;
  const ty = recenter ? 16 - cy : 0; // move the group's centre to the tile's centre
  for (const [x, y, w, h, r, c] of BARS) {
    shapes.push({
      x: cx + (x - cx) * scale,
      y: cy + (y - cy) * scale + ty,
      w: w * scale,
      h: h * scale,
      r: r * scale,
      c,
    });
  }
  return shapes;
}

function inRoundRect(px, py, s) {
  if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false;
  const r = Math.min(s.r, s.w / 2, s.h / 2);
  if (r <= 0) return true;
  const dx = Math.max(s.x + r - px, 0, px - (s.x + s.w - r));
  const dy = Math.max(s.y + r - py, 0, py - (s.y + s.h - r));
  return dx * dx + dy * dy <= r * r;
}

/** RGBA pixels (straight alpha) of `shapes` drawn at `size`×`size`. */
function rasterize(shapes, size, ss = 8) {
  const px = Buffer.alloc(size * size * 4);
  const unit = 32 / size; // design units per pixel
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const dx = (x + (sx + 0.5) / ss) * unit;
          const dy = (y + (sy + 0.5) / ss) * unit;
          // Opaque shapes: the topmost one that contains the sample wins.
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (inRoundRect(dx, dy, shapes[i])) {
              const c = shapes[i].c;
              r += c[0];
              g += c[1];
              b += c[2];
              a += 1;
              break;
            }
          }
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        // Average of the covered samples = un-premultiplied colour; alpha = coverage.
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
        px[o + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8-bit RGBA PNG. Rows use the "Sub" filter, which suits flat-colour art well. */
function encodePng(rgba, size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (stride + 1);
    raw[row] = 1; // filter: Sub
    for (let i = 0; i < stride; i++) {
      const cur = rgba[y * stride + i];
      const left = i >= 4 ? rgba[y * stride + i - 4] : 0;
      raw[row + 1 + i] = (cur - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = [
  // "any": the favicon as-is, rounded tile with transparent corners.
  { file: 'icon-192.png', size: 192, shapes: design({ tileRadius: 7 }) },
  { file: 'icon-512.png', size: 512, shapes: design({ tileRadius: 7 }) },
  // Maskable: full-bleed tile; the bars (centred) stay well inside the 80% safe circle, since
  // launchers crop to circles, squircles, teardrops…  Bars' half-diagonal ≈ 0.44 × 0.78 ≈ 0.34 of the size.
  { file: 'icon-maskable-512.png', size: 512, shapes: design({ tileRadius: 0, scale: 0.78, recenter: true }) },
  // iOS rounds the corners itself and fills transparency with black, so: full-bleed and opaque.
  { file: 'apple-touch-icon.png', size: 180, shapes: design({ tileRadius: 0 }) },
];

mkdirSync(out, { recursive: true });
for (const icon of ICONS) {
  const png = encodePng(rasterize(icon.shapes, icon.size), icon.size);
  writeFileSync(join(out, icon.file), png);
  console.log(`${icon.file}  ${icon.size}×${icon.size}  ${png.length} bytes`);
}
