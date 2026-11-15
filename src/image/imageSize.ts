// Read pixel dimensions from an image file header WITHOUT decoding it, so we can refuse huge images
// before the browser allocates width*height*4 bytes. Pure -> unit-testable in Node.

export interface ImageHeader {
  format: 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp';
  /** Stored (not EXIF-rotated) size. */
  width: number;
  height: number;
  /** JPEG EXIF orientation 1–8, when present (5–8 = displayed rotated by 90°). */
  orientation?: number;
}

/** Returns null for unknown/truncated headers (caller then decodes and checks afterwards). */
export function readImageSize(b: Uint8Array): ImageHeader | null {
  const u16be = (o: number) => (b[o] << 8) | b[o + 1];
  const u16le = (o: number) => b[o] | (b[o + 1] << 8);
  const u24le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const i32le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

  // PNG: signature + IHDR
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') {
    return { format: 'png', width: u32be(16), height: u32be(20) };
  }
  // GIF87a / GIF89a: logical screen size
  if (b.length >= 10 && ascii(0, 4) === 'GIF8') {
    return { format: 'gif', width: u16le(6), height: u16le(8) };
  }
  // BMP: BITMAPINFOHEADER (height may be negative = top-down)
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    const hdr = i32le(14);
    if (hdr === 12) return { format: 'bmp', width: u16le(18), height: u16le(20) };
    return { format: 'bmp', width: Math.abs(i32le(18)), height: Math.abs(i32le(22)) };
  }
  // WebP: RIFF....WEBP + VP8 / VP8L / VP8X
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8X') return { format: 'webp', width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === 'VP8L') {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { format: 'webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    return null;
  }
  // JPEG: walk segments to the first SOFn (noting the EXIF orientation on the way)
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    let orientation: number | undefined;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1];
      if (marker === 0xff) {
        o++; // fill byte
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(o + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const hdr: ImageHeader = { format: 'jpeg', height: u16be(o + 5), width: u16be(o + 7) };
        if (orientation) hdr.orientation = orientation;
        return hdr;
      }
      if (len < 2) return null;
      if (marker === 0xe1 && orientation === undefined) orientation = exifOrientation(b, o + 4, Math.min(b.length, o + 2 + len));
      o += 2 + len;
    }
    return null;
  }
  return null;
}

/** EXIF orientation (1–8) from an APP1 payload at [start, end), or undefined. Bounds-checked. */
function exifOrientation(b: Uint8Array, start: number, end: number): number | undefined {
  // "Exif\0\0" then a TIFF header: "II" (little endian) or "MM" (big endian), 42, IFD0 offset.
  if (end - start < 14) return undefined;
  if (b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66 || b[start + 4] || b[start + 5]) return undefined;
  const t = start + 6;
  const le = b[t] === 0x49 && b[t + 1] === 0x49;
  if (!le && !(b[t] === 0x4d && b[t + 1] === 0x4d)) return undefined;
  const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
  if (u16(t + 2) !== 42) return undefined;
  const ifd = t + u32(t + 4);
  if (ifd + 2 > end) return undefined;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) return undefined;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : undefined;
    }
  }
  return undefined;
}

/** HEIC/HEIF container (iPhone photos)? AVIF shares the container and is reported as false. */
export function isHeif(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const ascii = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (ascii(4) !== 'ftyp') return false;
  const heic = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'];
  const major = ascii(8);
  if (heic.includes(major)) return true;
  if (major !== 'mif1' && major !== 'msf1') return false;
  // Generic HEIF brand: look at the compatible brands.
  const boxEnd = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
  let sawHeic = false;
  for (let o = 16; o + 4 <= boxEnd; o += 4) {
    const c = ascii(o);
    if (c === 'avif' || c === 'avis') return false;
    if (heic.includes(c)) sawHeic = true;
  }
  return sawHeic;
}
