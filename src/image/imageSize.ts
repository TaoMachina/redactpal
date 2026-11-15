// Read pixel dimensions from an image file header WITHOUT decoding it, so we can refuse huge images
// before the browser allocates width*height*4 bytes. Pure -> unit-testable in Node.

export interface ImageHeader {
  format: 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp';
  width: number;
  height: number;
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
  // JPEG: walk segments to the first SOFn
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
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
      if (isSof) return { format: 'jpeg', height: u16be(o + 5), width: u16be(o + 7) };
      if (len < 2) return null;
      o += 2 + len;
    }
    return null;
  }
  return null;
}
