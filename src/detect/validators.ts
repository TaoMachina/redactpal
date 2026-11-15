// Pure validators used by the detection rules. No DOM, no dependencies.

/** Luhn checksum over a string of ASCII digits. */
export function luhn(digits: string): boolean {
  if (digits.length === 0) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Card network for a digit string, or null if the prefix/length combination is not a known card. */
export function cardBrand(d: string): string | null {
  const l = d.length;
  if (l < 12 || l > 19) return null;
  const p2 = Number(d.slice(0, 2));
  const p3 = Number(d.slice(0, 3));
  const p4 = Number(d.slice(0, 4));
  const p6 = Number(d.slice(0, 6));
  if (d[0] === '4' && (l === 13 || l === 16 || l === 19)) return 'Visa';
  if (((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) && l === 16) return 'Mastercard';
  if ((p2 === 34 || p2 === 37) && l === 15) return 'American Express';
  if ((p4 === 6011 || p2 === 65 || (p3 >= 644 && p3 <= 649) || (p6 >= 622126 && p6 <= 622925)) && l >= 16) return 'Discover';
  if (((p3 >= 300 && p3 <= 305) || p2 === 36 || p2 === 38 || p2 === 39 || p4 === 3095) && l >= 14) return 'Diners Club';
  if (p4 >= 3528 && p4 <= 3589 && l >= 16) return 'JCB';
  if (p2 === 62 && l >= 16) return 'UnionPay';
  if (p4 >= 2200 && p4 <= 2204 && l === 16) return 'Mir';
  if ((p2 === 50 || (p2 >= 56 && p2 <= 69)) && l >= 12) return 'Maestro';
  return null;
}

/** IBAN lengths per country (ISO 13616 registry, incl. common partial-membership countries). */
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18,
  FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HN: 28, HR: 21, HU: 28,
  IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20,
  LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28,
  NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24,
  SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26,
  UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
};

/** IBAN check: known country, correct length, mod-97 == 1. Spaces are ignored. */
export function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const want = IBAN_LENGTHS[s.slice(0, 2)];
  if (!want || s.length !== want) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let mod = 0;
  for (let i = 0; i < r.length; i++) {
    const c = r.charCodeAt(i);
    if (c >= 65) mod = (mod * 100 + (c - 55)) % 97;
    else mod = (mod * 10 + (c - 48)) % 97;
  }
  return mod === 1;
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  let n = 0;
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    n++;
  }
  let h = 0;
  for (const v of counts.values()) {
    const p = v / n;
    h -= p * Math.log2(p);
  }
  return h;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode standard or URL-safe base64 (padding optional). Returns null on invalid input. */
export function base64Decode(input: string): Uint8Array | null {
  const s = input.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64.indexOf(s[i]);
    if (v < 0) return null;
    buf = ((buf << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, j);
}

function bytesToLatin1(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** JWT header must base64url-decode to a JSON object with a string "alg". */
export function jwtHeaderValid(headerPart: string): boolean {
  const bytes = base64Decode(headerPart);
  if (!bytes || bytes.length < 8) return false;
  try {
    const obj: unknown = JSON.parse(bytesToLatin1(bytes));
    return typeof obj === 'object' && obj !== null && typeof (obj as Record<string, unknown>).alg === 'string';
  } catch {
    return false;
  }
}

/** Discord bot token: first segment is base64 of a numeric snowflake (user id). */
export function discordIdSegmentValid(seg: string): boolean {
  const bytes = base64Decode(seg);
  if (!bytes) return false;
  const s = bytesToLatin1(bytes);
  return /^\d{17,20}$/.test(s);
}

/** IPv4 dotted-quad with octets 0–255 and no leading zeros. */
export function ipv4Valid(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(?:0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

/** US SSN: excludes area 000/666/9xx, group 00, serial 0000 and well-known invalid/advertising numbers. */
export function ssnValid(area: string, group: string, serial: string): boolean {
  if (area === '000' || area === '666' || area[0] === '9') return false;
  if (group === '00' || serial === '0000') return false;
  const all = area + group + serial;
  if (all === '078051120' || all === '219099999') return false;
  if (/^(\d)\1{8}$/.test(all)) return false;
  return true;
}

// ---------- SHA-256 (for base58check) ----------
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256(data: Uint8Array): Uint8Array {
  const l = data.length;
  const n = ((l + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(n);
  buf.set(data);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLen = l * 8;
  dv.setUint32(n - 4, bitLen >>> 0);
  dv.setUint32(n - 8, Math.floor(bitLen / 0x100000000));
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < n; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15];
      const w2 = W[i - 2];
      const s0 = ror(w15, 7) ^ ror(w15, 18) ^ (w15 >>> 3);
      const s1 = ror(w2, 17) ^ ror(w2, 19) ^ (w2 >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + W[i]) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  for (let i = 0; i < s.length && s[i] === '1'; i++) bytes.push(0);
  return Uint8Array.from(bytes.reverse());
}

/** Legacy BTC address (P2PKH '1…' / P2SH '3…'): 25 bytes, double-SHA256 checksum. */
export function base58CheckBtcValid(s: string): boolean {
  const b = base58Decode(s);
  if (!b || b.length !== 25) return false;
  if (b[0] !== 0x00 && b[0] !== 0x05) return false;
  const payload = b.subarray(0, 21);
  const chk = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) if (chk[i] !== b[21 + i]) return false;
  return true;
}

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i];
  }
  return chk >>> 0;
}

/** Bech32 / bech32m checksum (BIP-173 / BIP-350). Lowercase input expected. */
export function bech32Valid(s: string): boolean {
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length || s.length > 90) return false;
  const hrp = s.slice(0, pos);
  const values: number[] = [];
  for (const c of hrp) values.push(c.charCodeAt(0) >> 5);
  values.push(0);
  for (const c of hrp) values.push(c.charCodeAt(0) & 31);
  for (const c of s.slice(pos + 1)) {
    const v = BECH32.indexOf(c);
    if (v < 0) return false;
    values.push(v);
  }
  const pm = bech32Polymod(values);
  return pm === 1 || pm === 0x2bc830a3;
}
