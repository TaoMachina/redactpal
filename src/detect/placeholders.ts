// Text-mode output: reversible placeholders and irreversible redaction.
import type { Finding, FindingKind } from '../core/types';

const PREFIX: Record<FindingKind, string> = {
  email: 'EMAIL',
  phone: 'PHONE',
  credit_card: 'CREDIT_CARD',
  iban: 'IBAN',
  ssn: 'SSN',
  ip_address: 'IP_ADDRESS',
  mac_address: 'MAC_ADDRESS',
  url_credential: 'URL_CREDENTIAL',
  api_key: 'API_KEY',
  private_key: 'PRIVATE_KEY',
  jwt: 'JWT',
  password: 'PASSWORD',
  secret_generic: 'SECRET',
  crypto_address: 'CRYPTO_ADDRESS',
  custom: 'CUSTOM',
};

/** Placeholder stem for a kind, e.g. 'api_key' -> 'API_KEY'. */
export function placeholderPrefix(kind: FindingKind): string {
  return PREFIX[kind] ?? String(kind).toUpperCase();
}

/** Sorted, non-overlapping copy of findings that are consistent with `text`. */
function usable(text: string, findings: Finding[]): Finding[] {
  const sorted = findings
    .filter((f) => f.start >= 0 && f.end <= text.length && f.end > f.start)
    .slice()
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Finding[] = [];
  let lastEnd = -1;
  for (const f of sorted) {
    if (f.start < lastEnd) continue;
    out.push(f);
    lastEnd = f.end;
  }
  return out;
}

// Matches [EMAIL_1], [email_1], [ EMAIL_1 ], [EMAIL 1], [API_KEY_2], \[EMAIL\_1\] (markdown-escaped).
const PLACEHOLDER_RE = /\\?\[\s*([A-Za-z]{1,30}(?:(?:\\?_|\s)[A-Za-z]{1,30}){0,4})(?:\\?_|\s)*(\d{1,6})\s*\\?\]/g;

function normKey(name: string, num: string): string {
  return `${name.replace(/\\/g, '').trim().replace(/[\s_]+/g, '_').toUpperCase()}_${Number(num)}`;
}

export function applyPlaceholders(text: string, findings: Finding[]): { text: string; mapping: Record<string, string> } {
  const list = usable(text, findings);
  const mapping: Record<string, string> = {};
  const byValue = new Map<string, string>();
  const counters = new Map<string, number>();
  // Never mint a placeholder that already occurs in the input (it would be ambiguous on restore).
  const existing = new Set<string>();
  PLACEHOLDER_RE.lastIndex = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) existing.add(normKey(m[1], m[2]));

  let out = '';
  let pos = 0;
  for (const f of list) {
    const original = text.slice(f.start, f.end);
    let ph = byValue.get(original);
    if (!ph) {
      const prefix = placeholderPrefix(f.kind);
      let n = counters.get(prefix) ?? 0;
      do n++;
      while (existing.has(`${prefix}_${n}`));
      counters.set(prefix, n);
      ph = `[${prefix}_${n}]`;
      byValue.set(original, ph);
      mapping[ph] = original;
    }
    out += text.slice(pos, f.start) + ph;
    pos = f.end;
  }
  out += text.slice(pos);
  return { text: out, mapping };
}

export function restorePlaceholders(text: string, mapping: Record<string, string>): string {
  const norm = new Map<string, string>();
  const literal: Array<[string, string]> = [];
  for (const [ph, original] of Object.entries(mapping)) {
    PLACEHOLDER_RE.lastIndex = 0;
    const m = PLACEHOLDER_RE.exec(ph);
    if (m && m.index === 0 && m[0].length === ph.length) norm.set(normKey(m[1], m[2]), original);
    else literal.push([ph, original]);
  }
  let out = text;
  // Non-standard keys (not produced by applyPlaceholders) are replaced literally, longest first.
  literal.sort((a, b) => b[0].length - a[0].length);
  for (const [ph, original] of literal) if (ph) out = out.split(ph).join(original);
  if (!norm.size) return out;
  return out.replace(PLACEHOLDER_RE, (whole, name: string, num: string) => {
    const v = norm.get(normKey(name, num));
    return v === undefined ? whole : v;
  });
}

export function redactText(text: string, findings: Finding[], style: 'block' | 'label' = 'label'): string {
  const list = usable(text, findings);
  let out = '';
  let pos = 0;
  for (const f of list) {
    out += text.slice(pos, f.start);
    const original = text.slice(f.start, f.end);
    if (style === 'block') out += original.replace(/[^\r\n]/g, '█');
    else out += `[REDACTED ${placeholderPrefix(f.kind).replace(/_/g, ' ')}]`;
    pos = f.end;
  }
  return out + text.slice(pos);
}
