// Built-in detection rules. Each rule scans the whole text once and emits candidate spans;
// detect() resolves overlaps. All regexes are written to avoid catastrophic backtracking:
// start positions are pinned by look-behinds / literals and quantified groups are unambiguous.
import type { Confidence, FindingKind } from '../core/types';
import {
  base58CheckBtcValid,
  bech32Valid,
  cardBrand,
  discordIdSegmentValid,
  IBAN_LENGTHS,
  ibanValid,
  ipv4Valid,
  jwtHeaderValid,
  luhn,
  shannonEntropy,
  ssnValid,
} from './validators';

export type Emit = (start: number, end: number, confidence?: Confidence, label?: string) => void;

export interface RuleDef {
  id: string;
  label: string;
  kind: FindingKind;
  description: string;
  confidence: Confidence;
  scan(text: string, emit: Emit): void;
}

/** Iterate all matches of a global regex (handles zero-length matches). */
function eachMatch(re: RegExp, text: string, cb: (m: RegExpExecArray) => void | number): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const next = cb(m);
    if (typeof next === 'number') re.lastIndex = next;
  }
}

/** Span of capture group `g` (regex must have the `d` flag). */
function groupSpan(m: RegExpExecArray, g: number): [number, number] | null {
  const ind = m.indices?.[g];
  return ind ? [ind[0], ind[1]] : null;
}

/** Simple rule: every match (or capture group) that passes `validate` is emitted. */
function regexScan(
  re: RegExp,
  opts: { group?: number; validate?: (m: RegExpExecArray, value: string) => boolean | Confidence } = {},
) {
  return (text: string, emit: Emit) => {
    eachMatch(re, text, (m) => {
      let start = m.index;
      let end = m.index + m[0].length;
      if (opts.group !== undefined) {
        const sp = groupSpan(m, opts.group);
        if (!sp) return;
        [start, end] = sp;
      }
      const value = text.slice(start, end);
      const v = opts.validate ? opts.validate(m, value) : true;
      if (v === false) return;
      emit(start, end, v === true ? undefined : v);
    });
  };
}

// ---------------------------------------------------------------------------------------------
// Shared helpers for value checks
// ---------------------------------------------------------------------------------------------

const PLACEHOLDER_VALUE =
  /^(?:\*+|x{3,}|X{3,}|•+|●+|·+|\.{2,}|…|_+|-+|\?+|#+|null|nil|none|undefined|true|false|yes|no|on|off|empty|n\/a|tbd|todo|redacted|\[redacted\]|hidden|masked|example|sample|dummy|placeholder|changeme|your[_-]?[a-z_-]*|<[^>]*>|\$\{?[\w.:-]+\}?|\{\{.*\}\}|\{[\w.-]+\}|%[sdv]|%\([\w]+\)s|\$\d+|:[a-z_]+|\?|string|str|number|int|integer|bool|boolean|any|object|bytes|text|varchar.*|char.*|optional.*|required|secretstr|unknown|void)$/i;

export function isPlaceholderValue(v: string): boolean {
  return PLACEHOLDER_VALUE.test(v.trim());
}

const PROSE_STOPWORDS = new Set(
  (
    'a an and are be been can click confirm current do does enter expired field for forgot here hidden ' +
    'if in incorrect invalid is it manager must my new no not of ok old on or please policy protected ' +
    'required reset saved set should show strength that the this to updated was will wrong you your ' +
    'changed change see below above'
  ).split(' '),
);

const CODE_KEYWORDS = new Set(
  'return function new this null typeof await async void true false const let var class import export default if else'.split(' '),
);

const ALNUM = /[A-Za-z0-9]/;

// ---------------------------------------------------------------------------------------------
// Email (strict + OCR-spaced)
// ---------------------------------------------------------------------------------------------

const EMAIL_STRICT = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const EMAIL_SPACED =
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9][A-Za-z0-9_%+-]*(?:(?:\.| \. )[A-Za-z0-9_%+-]+)* ?@ ?[A-Za-z0-9-]+(?: ?\. ?[A-Za-z0-9-]+)+/g;
const FILE_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'css', 'js', 'mjs', 'ts', 'map', 'json', 'html', 'txt', 'pdf']);
const COMMON_TLDS = new Set(
  (
    'com net org edu gov mil int io co uk de fr cn jp in ru br it es nl au ca ch se no dk fi pl be at cz ' +
    'pt ie nz za mx ar kr tw hk sg my id th vn tr gr hu ro il ae sa me info biz dev app ai us eu xyz tech ' +
    'online site email mail cloud pro name mobi tv cc ly to gg'
  ).split(' '),
);

/** Trim trailing domain labels until the last one is acceptable. Returns new end or -1. */
function emailEnd(s: string, accept: (tld: string) => boolean): number {
  const at = s.indexOf('@');
  if (at <= 0) return -1;
  let end = s.length;
  for (;;) {
    const domain = s.slice(at + 1, end);
    const lastDot = domain.lastIndexOf('.');
    if (lastDot < 0) return -1;
    const tld = domain.slice(lastDot + 1).trim();
    if (accept(tld) && domain.slice(0, lastDot).replace(/[\s.]/g, '').length > 0) return end;
    end = at + 1 + lastDot;
    while (end > at + 1 && s[end - 1] === ' ') end--;
  }
}

function scanEmail(text: string, emit: Emit) {
  eachMatch(EMAIL_STRICT, text, (m) => {
    const s = m[0];
    const end = emailEnd(s, (t) => /^[A-Za-z]{2,24}$/.test(t) && !FILE_TLDS.has(t.toLowerCase()));
    if (end < 0) return;
    const local = s.slice(0, s.indexOf('@'));
    if (local.endsWith('.')) return;
    if (/^git$/i.test(local)) return; // git@github.com:org/repo — an SSH remote, not a person
    // user:pass@host inside a URL is handled by url_credential (which also covers the user name).
    if (text[m.index - 1] === ':' && /:\/\/[^\s/?#@]*$/.test(text.slice(Math.max(0, m.index - 256), m.index))) return;
    emit(m.index, m.index + end);
  });
  eachMatch(EMAIL_SPACED, text, (m) => {
    const s = m[0];
    if (!/\s/.test(s)) return; // handled by the strict pattern
    const end = emailEnd(s, (t) => COMMON_TLDS.has(t)); // lowercase, known TLD only
    if (end < 0) return;
    const core = s.slice(0, end);
    if (!/\s/.test(core)) return;
    emit(m.index, m.index + end, 'medium');
  });
}

// ---------------------------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------------------------

const DIGIT_RUN = /(?<![\w.,/-])\d+(?:[ -]\d+)*/g;

function cardGroupingOk(sizes: number[], seps: string[]): boolean {
  if (sizes.length === 1) return true;
  if (new Set(seps).size > 1) return false;
  const total = sizes.reduce((a, b) => a + b, 0);
  const key = sizes.join('-');
  // Standard 4-4-4-4(-x) groupings, Amex 4-6-5, Diners 4-6-4.
  if (sizes.slice(0, -1).every((n) => n === 4) && sizes[sizes.length - 1] >= 1 && sizes[sizes.length - 1] <= 4) return true;
  if (key === '4-6-5' || key === '4-6-4') return true;
  // Irregular OCR splits: first group >= 4 digits, all groups >= 2 digits.
  return total >= 13 && sizes[0] >= 4 && sizes.every((n) => n >= 2 && n <= 8);
}

function scanCards(text: string, emit: Emit) {
  eachMatch(DIGIT_RUN, text, (m) => {
    const s = m[0];
    if (s.length < 13) return;
    // split into groups
    const groups: Array<{ start: number; end: number }> = [];
    const seps: string[] = [];
    const re = /\d+/g;
    let g: RegExpExecArray | null;
    while ((g = re.exec(s)) !== null) {
      if (groups.length) seps.push(s[g.index - 1]);
      groups.push({ start: g.index, end: g.index + g[0].length });
    }
    let i = 0;
    while (i < groups.length) {
      // every accepted grouping starts with a group of >= 4 digits (see cardGroupingOk)
      if (groups[i].end - groups[i].start < 4) {
        i++;
        continue;
      }
      let found = -1;
      // longest window starting at group i
      let digits = 0;
      const sizes: number[] = [];
      let lastOk = -1;
      for (let j = i; j < groups.length; j++) {
        const n = groups[j].end - groups[j].start;
        digits += n;
        sizes.push(n);
        if (digits > 19) break;
        if (digits >= 13) {
          const raw = s.slice(groups[i].start, groups[j].end).replace(/\D/g, '');
          if (
            cardGroupingOk(sizes, seps.slice(i, j)) &&
            !/^(\d)\1+$/.test(raw) &&
            cardBrand(raw) &&
            luhn(raw)
          )
            lastOk = j;
        }
      }
      found = lastOk;
      if (found >= 0) {
        emit(m.index + groups[i].start, m.index + groups[found].end);
        i = found + 1;
      } else i++;
    }
  });
}

// ---------------------------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------------------------

const IBAN_RE = /(?<![A-Za-z0-9])[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,34}/g;

function scanIban(text: string, emit: Emit) {
  eachMatch(IBAN_RE, text, (m) => {
    const s = m[0];
    const want = IBAN_LENGTHS[s.slice(0, 2)];
    if (!want) return m.index + 2;
    let count = 0;
    let endPos = -1;
    for (let k = 0; k < s.length; k++) {
      if (s[k] !== ' ') {
        count++;
        if (count === want) {
          endPos = k + 1;
          break;
        }
      }
    }
    if (endPos < 0) return m.index + 2;
    const after = text[m.index + endPos];
    if (after !== undefined && ALNUM.test(after)) return m.index + 2;
    if (!ibanValid(s.slice(0, endPos))) return m.index + 2;
    emit(m.index, m.index + endPos);
    return m.index + endPos;
  });
}

// ---------------------------------------------------------------------------------------------
// Private key blocks
// ---------------------------------------------------------------------------------------------

const PK_BEGIN = /-{3,} ?BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY(?: BLOCK)? ?-{3,}/g;
const PK_END = /-{3,} ?END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)? ?-{3,}/g;

function scanPrivateKeys(text: string, emit: Emit) {
  eachMatch(PK_BEGIN, text, (m) => {
    const start = m.index;
    const headerEnd = m.index + m[0].length;
    PK_END.lastIndex = headerEnd;
    const e = PK_END.exec(text);
    const nextBegin = text.indexOf('BEGIN ', headerEnd);
    if (e && (nextBegin < 0 || nextBegin > e.index)) {
      const end = e.index + e[0].length;
      emit(start, end);
      return end;
    }
    // Truncated block (e.g. a screenshot that cuts off): extend over base64 / header lines.
    let end = headerEnd;
    let pos = headerEnd;
    let blank = 0;
    while (pos < text.length) {
      let nl = text.indexOf('\n', pos);
      if (nl < 0) nl = text.length;
      const raw = text.slice(pos, nl);
      const line = raw.trim();
      if (line === '') {
        if (++blank > 1) break;
      } else if (/^[A-Za-z0-9+/=]+$/.test(line) || /^[A-Za-z-]+: \S.*$/.test(line)) {
        blank = 0;
        end = pos + raw.trimEnd().length;
      } else break;
      pos = nl + 1;
    }
    emit(start, end);
    return Math.max(end, headerEnd);
  });
}

// ---------------------------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------------------------

const JWT_RE = /(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{5,})\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g;

// ---------------------------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------------------------

const PHONE_CAND = /(?<![\w+.\-/:@$€£¥#%,])(?:\+ ?|\()?\d[\d ()./\- ]{5,24}\d\)?(?![\w@%€$£¥]|[.,:/\-]\d)/g;

const PHONE_NATIONAL: RegExp[] = [
  /^\(\d{3}\)[ -]?\d{3}[-. ]\d{4}$/, // US (555) 123-4567
  /^[2-9]\d{2}([-. ])\d{3}\1\d{4}$/, // US 555-123-4567 / 555.123.4567
  /^1([-. ])[2-9]\d{2}\1\d{3}\1\d{4}$/, // US 1-800-555-1234
  /^1 ?\(\d{3}\) ?\d{3}[-. ]\d{4}$/, // US 1 (800) 555-1234
  /^(?:\(0\d{1,4}\) ?|0\d{1,4}[ /.-])\d{2,8}(?:[ /.-]\d{2,8}){0,3}$/, // UK/DE/FR/JP/IN… trunk-0 numbers
  /^1[3-9]\d([ -]?)\d{4}\1\d{4}$/, // CN mobile 138 0013 8000
  /^07\d{9}$/, // UK mobile compact
  /^[6-9]\d{4}[ -]\d{5}$/, // IN mobile 98765 43210
];

// Total digit counts (country code included) for common country codes; others: 8–15.
const CC_LENGTHS: Array<[string, number[]]> = [
  ['1', [11]], ['7', [11]], ['33', [11]], ['34', [11]], ['39', [11, 12, 13]], ['44', [11, 12]],
  ['49', [10, 11, 12, 13, 14]], ['61', [11]], ['81', [11, 12]], ['86', [11, 12, 13]], ['91', [12]],
  ['31', [11]], ['32', [10, 11]], ['41', [11]], ['43', [10, 11, 12, 13]], ['46', [9, 10, 11, 12]],
  ['48', [11]], ['52', [12]], ['55', [12, 13]], ['82', [11, 12]], ['852', [11]], ['886', [11, 12]],
];

function intlLengthOk(d: string): boolean {
  for (const [cc, lens] of CC_LENGTHS) if (d.startsWith(cc)) return lens.includes(d.length);
  return d.length >= 8 && d.length <= 15;
}

function phoneValid(s: string): boolean {
  if (/[.\/-]{2}|\s{2}|[.\/-]\s|\s[.\/-]/.test(s)) return false;
  // balanced parentheses, at most one pair
  const open = (s.match(/\(/g) ?? []).length;
  const close = (s.match(/\)/g) ?? []).length;
  if (open !== close || open > 1) return false;
  if (open === 1 && s.indexOf('(') > s.indexOf(')')) return false;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  // dates, times, IPs, versions
  if (/^\d{4}[-./ ]\d{1,2}[-./ ]\d{1,2}$/.test(s)) return false;
  if (/^\d{1,2}[-./ ]\d{1,2}[-./ ]\d{2,4}$/.test(s)) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s)) return false;
  if (s.includes('.') && !/^(?:\+ ?\d{1,3}[ .]?)?(?:\(?\d{2,4}\)?\.)?\d{2,4}(?:\.\d{2,4}){1,4}$/.test(s)) return false;
  if (s[0] === '+') {
    const rest = s.slice(1).trim();
    if (!/^[1-9]/.test(rest)) return false;
    const plain = rest.replace(/\(0\)/, '');
    const d = plain.replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) return false;
    // groups of at most 10 digits unless fully compact
    const groups = plain.split(/[ ()./\- ]+/).filter(Boolean);
    if (groups.length > 1 && groups.some((g) => g.length > 10)) return false;
    return intlLengthOk(d);
  }
  if (/^00[1-9]/.test(s) && /[ ./-]/.test(s)) return intlLengthOk(digits.slice(2));
  const norm = s.replace(/ /g, ' ');
  if (norm[0] === '0' || norm.startsWith('(0')) {
    if (digits.length < 9 || digits.length > 12) return false;
  }
  return PHONE_NATIONAL.some((re) => re.test(norm));
}

function scanPhones(text: string, emit: Emit) {
  eachMatch(PHONE_CAND, text, (m) => {
    const s = m[0];
    // group boundaries (start of each digit group / opening paren / plus), end of each
    const starts: number[] = [];
    const ends: number[] = [];
    const re = /[+(]?\d+\)?/g;
    let g: RegExpExecArray | null;
    while ((g = re.exec(s)) !== null) {
      starts.push(g.index);
      ends.push(g.index + g[0].length);
    }
    const n = starts.length;
    for (let lead = 0; lead < Math.min(n, 4); lead++) {
      // only cut at whitespace, never inside "4.07014" / "12-34"
      if (lead > 0 && !/\s/.test(s[starts[lead] - 1])) continue;
      for (let trail = n - 1; trail >= lead; trail--) {
        if (trail < n - 1 && !/\s/.test(s[ends[trail]])) continue;
        let a = lead === 0 ? 0 : starts[lead];
        let b = ends[trail];
        let sub = s.slice(a, b);
        // drop an unmatched trailing ')' or leading '('
        if (sub.endsWith(')') && !sub.includes('(')) {
          sub = sub.slice(0, -1);
          b--;
        }
        if (sub.startsWith('(') && !sub.includes(')')) {
          sub = sub.slice(1);
          a++;
        }
        if (sub.replace(/\D/g, '').length < 8) break;
        // compact "+4294967296" in code: require a clean left context
        if (sub[0] === '+' && !/[\s()./-]/.test(sub.slice(1)) && !/^[\s:("'<>=,;\[]?$/.test(text.slice(Math.max(0, m.index + a - 1), m.index + a)))
          continue;
        if (phoneValid(sub)) {
          emit(m.index + a, m.index + b);
          return;
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// IP / MAC
// ---------------------------------------------------------------------------------------------

const IPV4_RE = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)/g;
const IPV6_RE = /(?<![\w:.])(?:[0-9A-Fa-f]{1,4}|:)(?::[0-9A-Fa-f]{0,4}){1,7}(?![\w:.])/g;
const MAC_RE = /(?<![\w:.-])[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}(?:\1[0-9A-Fa-f]{2}){4}(?![\w:-])/g;
const MAC_CISCO_RE = /(?<![\w.])[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}(?![\w.])/g;

function ipv4Confidence(s: string): Confidence | false {
  if (!ipv4Valid(s)) return false;
  if (s === '0.0.0.0' || s.startsWith('127.') || s.startsWith('255.')) return 'low';
  // "12.7.5.2", "8.6.4.4": more often section numbers than hosts
  if (s.split('.').every((o) => Number(o) < 32) && !s.startsWith('10.')) return 'low';
  return 'medium';
}

const SECTION_CONTEXT = /(?:section|sect\.|sec\.|§|chapter|chap\.|clause|table|figure|fig\.|appendix|version|ver\.|release|rfc|iso|step|item|rule|art\.|article|para\.|paragraph)\s*$/i;

function scanIpv4(text: string, emit: Emit) {
  eachMatch(IPV4_RE, text, (m) => {
    const c = ipv4Confidence(m[0]);
    if (!c) return;
    if (SECTION_CONTEXT.test(text.slice(Math.max(0, m.index - 16), m.index))) return;
    emit(m.index, m.index + m[0].length, c);
  });
}

function ipv6Confidence(s: string): Confidence | false {
  if (s.includes(':::')) return false;
  const dbl = s.split('::').length - 1;
  if (dbl > 1) return false;
  const groups = s.split(':').filter((x) => x.length > 0);
  if (groups.some((x) => x.length > 4)) return false;
  if (!/\d/.test(s)) return false;
  if (dbl === 0) {
    if (groups.length !== 8 || s.startsWith(':') || s.endsWith(':')) return false;
  } else {
    if (groups.length > 7) return false;
    if (groups.length === 0) return false;
    if (groups.length < 2 && !s.startsWith('::')) return false;
    // A single leading/trailing ':' is invalid unless part of '::'
    if ((s.startsWith(':') && !s.startsWith('::')) || (s.endsWith(':') && !s.endsWith('::'))) return false;
  }
  if (s === '::1' || /^::(?:0{1,4})?$/.test(s)) return 'low';
  return 'medium';
}

// ---------------------------------------------------------------------------------------------
// Key / value assignments (password, generic secrets)
// ---------------------------------------------------------------------------------------------

const ASSIGN_KEYWORD =
  /pass(?:word|wd|phrase)?|pwd|secret|token|webhook|dsn|api[_-]?key|apikey|(?:access|auth|private|signing|encryption|client|session|master|app|license)[_-]?key|credential/gi;
const ID_CHAR = /[A-Za-z0-9_.\-]/;
const NAME_EXCLUDE_LAST = new Set(
  (
    'type types count len length limit limits url uri urls endpoint path file filename name names id ids ttl ' +
    'expiry expires expiresin expiration expire header prefix suffix field policy hint label placeholder ' +
    'required enabled enable disabled min max size format version provider store manager service location ' +
    'mode strength rules rule reset regex pattern validator validation error errors message hash salt rounds ' +
    'algorithm algo encoding length meter lifetime timeout duration button btn title text description desc ' +
    'prompt dialog tooltip help link icon heading caption note form page screen modal view container wrapper ' +
    'class style color width height visible show toggle input invalid incorrect mismatch'
  ).split(' '),
);

function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_.\-]+/)
    .filter(Boolean);
}

function classifyName(name: string): 'password' | 'secret' | null {
  const toks = nameTokens(name);
  if (!toks.length) return null;
  if (NAME_EXCLUDE_LAST.has(toks[toks.length - 1])) return null;
  const joined = toks.join('');
  if (/password|passwd|passphrase/.test(joined) || toks.includes('pwd') || (toks.includes('pass') && toks.length > 1))
    return 'password';
  if (toks.some((t) => t.includes('secret') && !t.startsWith('secretar'))) return 'secret';
  if (toks.some((t) => t === 'token' || (t.endsWith('token') && t.length > 5))) return 'secret';
  if (toks.some((t) => t === 'webhook' || t === 'dsn')) return 'secret'; // URLs that act as credentials
  if (/apikey|(?:access|auth|private|signing|encryption|client|session|master|app|license)key|credential/.test(joined))
    return 'secret';
  return null;
}

interface Assignment {
  name: string;
  valueStart: number;
  valueEnd: number;
  quoted: boolean;
  after: string; // first non-space char after the value
}

/** Parse `name <op> value` starting right after an identifier [s,e). */
function parseAssignment(text: string, s: number, e: number): Assignment | null {
  const name = text.slice(s, e);
  let p = e;
  const q0 = text[s - 1];
  if ((q0 === '"' || q0 === "'" || q0 === '`') && text[p] === q0) p++;
  while (text[p] === ' ' || text[p] === '\t') p++;
  let hasOp = false;
  const c = text[p];
  const c2 = text[p + 1];
  if (c === ':' && c2 === '=') {
    p += 2;
    hasOp = true;
  } else if (c === '=' && c2 === '>') {
    p += 2;
    hasOp = true;
  } else if (c === '=' && c2 !== '=') {
    p += 1;
    hasOp = true;
  } else if (c === ':' && c2 !== ':') {
    p += 1;
    hasOp = true;
  } else if (name.startsWith('--') && p > e) {
    hasOp = true; // CLI flag: --password hunter2
  }
  if (!hasOp) return null;
  while (text[p] === ' ' || text[p] === '\t') p++;
  const q = text[p];
  if (q === '"' || q === "'" || q === '`') {
    let k = p + 1;
    while (k < text.length && text[k] !== q && text[k] !== '\n') {
      if (text[k] === '\\') k++;
      k++;
    }
    if (text[k] !== q) return null;
    let a = k + 1;
    while (text[a] === ' ') a++;
    return { name, valueStart: p + 1, valueEnd: k, quoted: true, after: text[a] ?? '' };
  }
  let k = p;
  while (k < text.length && !/[\s,;&"'<>(){}\[\]]/.test(text[k])) k++;
  // strip trailing sentence punctuation
  while (k > p && /[.,;:!?]/.test(text[k - 1])) k--;
  let a = k;
  while (text[a] === ' ') a++;
  return { name, valueStart: p, valueEnd: k, quoted: false, after: text[a] ?? '' };
}

function looksLikeCode(v: string, a: Assignment): boolean {
  if (a.quoted) return false;
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(v) && !/\d/.test(v.split('.').pop() ?? '')) return true; // obj.prop
  if (a.after === '(' || a.after === '[' || a.after === '.') return true; // call / index
  if (/^[A-Za-z_$][\w$]*$/.test(v) && (a.after === ';' || a.after === ')' || a.after === ',')) return true;
  return false;
}

function scanAssignments(kind: 'password' | 'secret') {
  return (text: string, emit: Emit) => {
    eachMatch(ASSIGN_KEYWORD, text, (m) => {
      let s = m.index;
      let e = m.index + m[0].length;
      while (s > 0 && ID_CHAR.test(text[s - 1])) s--;
      while (e < text.length && ID_CHAR.test(text[e])) e++;
      // trailing '.' or '-' are not part of a key name
      while (e > s && /[.\-]/.test(text[e - 1])) e--;
      const cls = classifyName(text.slice(s, e).replace(/^-+/, ''));
      const next = Math.max(e, m.index + m[0].length);
      if (cls !== kind) return next;
      const a = parseAssignment(text, s, e);
      if (!a) return next;
      const v = text.slice(a.valueStart, a.valueEnd);
      if (!v || isPlaceholderValue(v) || looksLikeCode(v, a)) return next;
      const bareName = a.name.replace(/^-+/, '');
      if (v.toLowerCase() === bareName.toLowerCase()) return next;
      if (/^\$|^%|^\{\{|^process\.env|^os\.environ|^env\(/i.test(v)) return next;
      if (a.quoted && /\\[nrt]/.test(v)) return next; // a source-code string literal, not a value
      if (!a.quoted && /^0x[0-9a-f]+$/i.test(v)) return next; // numeric constant in code
      if (kind === 'password') {
        if (v.length < 3) return next;
        if (!a.quoted && /^[A-Za-z]+$/.test(v)) {
          const lower = v.toLowerCase();
          if (PROSE_STOPWORDS.has(lower) || CODE_KEYWORDS.has(lower)) return next;
          // "Invalid password. Please try again" — a sentence, not a value
          if (/^ +[A-Za-z]/.test(text.slice(a.valueEnd, a.valueEnd + 2))) return next;
        }
      } else {
        if (v.length < 8) return next;
        if (v.includes('${') || !/^[\w+/=.~:@!#%^*$&-]+$/.test(v)) return next;
        // tokens nearly always contain digits; letter-only values must be long, quoted and mixed-case
        if (!/\d/.test(v) && !(a.quoted && v.length >= 20 && /[a-z]/.test(v) && /[A-Z]/.test(v))) return next;
        if (shannonEntropy(v) < 3.0) return next;
      }
      emit(a.valueStart, a.valueEnd);
      return Math.max(next, a.valueEnd);
    });
    if (kind === 'password') {
      const XML = /<((?:[\w-]*:)?(?:password|passwd|pwd|passphrase))>([^<\n]{3,256})<\/\1>/gid;
      eachMatch(XML, text, (m) => {
        const sp = groupSpan(m, 2);
        if (sp && !isPlaceholderValue(m[2])) emit(sp[0], sp[1]);
      });
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Authorization headers
// ---------------------------------------------------------------------------------------------

const AUTH_HEADER =
  /(?<![\w-])(?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:(?:bearer|basic|token|bot|apikey|api-key|sso-key|ghtoken)\s+)?([A-Za-z0-9._~+/=-]{6,})/gid;
const BEARER = /(?<![\w-])bearer\s+([A-Za-z0-9._~+/-]{16,}=*)/gid;
const AUTH_SCHEMES = /^(?:bearer|basic|token|bot|digest|apikey|negotiate|ntlm|hoba|mutual|aws4-hmac-sha256)$/i;

function scanAuth(text: string, emit: Emit) {
  eachMatch(AUTH_HEADER, text, (m) => {
    const sp = groupSpan(m, 1);
    if (!sp) return;
    const v = m[1];
    if (AUTH_SCHEMES.test(v) || isPlaceholderValue(v)) return;
    if (!/[0-9]/.test(v) && v.length < 12) return;
    emit(sp[0], sp[1]);
  });
  eachMatch(BEARER, text, (m) => {
    const sp = groupSpan(m, 1);
    if (!sp) return;
    const v = m[1];
    if (isPlaceholderValue(v) || shannonEntropy(v) < 3) return;
    emit(sp[0], sp[1]);
  });
}

// ---------------------------------------------------------------------------------------------
// URLs with credentials
// ---------------------------------------------------------------------------------------------

const URL_USERINFO = /(?<![A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]{1,20}:\/\/([^\s/?#@:"'<>]+):([^\s/?#@"'<>]+)@/gd;
const URL_PARAM =
  /[?&#;](?:access_token|refresh_token|id_token|auth_token|token|api_key|apikey|api-key|key|secret|client_secret|password|passwd|pwd|sig|signature|auth|session|sessionid|session_id|sid|jwt|x-amz-signature|x-amz-credential|x-amz-security-token|awsaccesskeyid|x-goog-signature|x-goog-credential)=([A-Za-z0-9%._~+/-][^&#\s"'<>|`]{3,})/gid;

function scanUrlCreds(text: string, emit: Emit) {
  eachMatch(URL_USERINFO, text, (m) => {
    const u = groupSpan(m, 1);
    const p = groupSpan(m, 2);
    if (!u || !p) return;
    if (/^(?:\*+|x+)$/i.test(m[2])) return;
    emit(u[0], p[1]);
  });
  eachMatch(URL_PARAM, text, (m) => {
    const sp = groupSpan(m, 1);
    if (!sp) return;
    const name = m[0].slice(1, m[0].indexOf('=')).toLowerCase();
    const v = m[1];
    if (isPlaceholderValue(v)) return;
    if (name === 'key' || name === 'sid' || name === 'auth') {
      if (v.length < 8 || shannonEntropy(v) < 2.8) return;
    }
    emit(sp[0], sp[1]);
  });
}

// ---------------------------------------------------------------------------------------------
// Provider-specific keys
// ---------------------------------------------------------------------------------------------

function hasLetterAndDigit(v: string): boolean {
  return /[A-Za-z]/.test(v) && /\d/.test(v);
}

// ---------------------------------------------------------------------------------------------
// Rule table (order = tie-break priority)
// ---------------------------------------------------------------------------------------------

export const RULE_DEFS: RuleDef[] = [
  {
    id: 'private_key',
    label: 'Private key',
    kind: 'private_key',
    description: 'PEM / OpenSSH / PGP private key blocks (-----BEGIN … PRIVATE KEY-----), including truncated blocks.',
    confidence: 'high',
    scan: scanPrivateKeys,
  },
  {
    id: 'jwt',
    label: 'JSON Web Token',
    kind: 'jwt',
    description: 'Three base64url parts whose header decodes to JSON containing "alg".',
    confidence: 'high',
    scan: regexScan(JWT_RE, { validate: (m) => jwtHeaderValid(m[1]) }),
  },
  {
    id: 'aws_access_key_id',
    label: 'AWS access key ID',
    kind: 'api_key',
    description: 'AWS access key IDs (AKIA… / ASIA… + 16 uppercase alphanumerics).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9])(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}(?![A-Za-z0-9])/g),
  },
  {
    id: 'aws_secret_access_key',
    label: 'AWS secret access key',
    kind: 'api_key',
    description: '40-character value assigned to aws_secret_access_key / SecretAccessKey.',
    confidence: 'high',
    scan: regexScan(
      /(?:aws_?secret_?(?:access_?)?key|secret_?access_?key)["']?\s*(?::=|=>|[:=])\s*["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/gid,
      { group: 1 },
    ),
  },
  {
    id: 'github_token',
    label: 'GitHub token',
    kind: 'api_key',
    description: 'GitHub tokens: ghp_, gho_, ghu_, ghs_, ghr_ and fine-grained github_pat_.',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})(?![A-Za-z0-9_])/g),
  },
  {
    id: 'gitlab_token',
    label: 'GitLab token',
    kind: 'api_key',
    description: 'GitLab personal/deploy/runner tokens (glpat-, gldt-, glrt-, glptt-, glsoat-).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])gl(?:pat|dt|rt|ptt|soat|cbt)-[A-Za-z0-9_-]{20,}/g),
  },
  {
    id: 'slack_token',
    label: 'Slack token',
    kind: 'api_key',
    description: 'Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-, xoxs-, xapp-).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])(?:xox[abprs]-[A-Za-z0-9-]{10,}|xapp-\d-[A-Za-z0-9-]{10,})/g, {
      validate: (_m, v) => /\d/.test(v),
    }),
  },
  {
    id: 'slack_webhook',
    label: 'Slack webhook URL',
    kind: 'api_key',
    description: 'Incoming webhook URLs on hooks.slack.com.',
    confidence: 'high',
    // OCR often inserts a stray space around dots/slashes ("hooks .slack.com"); tolerate one per gap.
    scan: regexScan(/https?:\/\/ ?hooks ?\. ?slack ?\. ?com ?\/ ?(?:services|workflows|triggers) ?\/[A-Za-z0-9_/-]{6,}/g),
  },
  {
    id: 'stripe_key',
    label: 'Stripe key',
    kind: 'api_key',
    description: 'Stripe secret/restricted/publishable keys (sk_/rk_/pk_ live/test) and webhook secrets (whsec_).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_])(?:(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,247}|whsec_[A-Za-z0-9]{20,})(?![A-Za-z0-9_])/g),
  },
  {
    id: 'anthropic_key',
    label: 'Anthropic API key',
    kind: 'api_key',
    description: 'Anthropic API keys (sk-ant-…).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{20,}/g),
  },
  {
    id: 'openai_key',
    label: 'OpenAI API key',
    kind: 'api_key',
    description: 'OpenAI API keys (sk-…, sk-proj-…, sk-svcacct-…, sk-admin-…).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])sk-(?!ant-)(?:(?:proj|svcacct|admin|None)-)?[A-Za-z0-9_-]{20,}/g, {
      validate: (_m, v) => {
        const body = v.replace(/^sk-(?:(?:proj|svcacct|admin|None)-)?/, '');
        return hasLetterAndDigit(body) && /[A-Z]/.test(body) && shannonEntropy(body) >= 3.5;
      },
    }),
  },
  {
    id: 'google_api_key',
    label: 'Google API key',
    kind: 'api_key',
    description: 'Google API keys (AIza + 35 characters).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g),
  },
  {
    id: 'sendgrid_key',
    label: 'SendGrid API key',
    kind: 'api_key',
    description: 'SendGrid API keys (SG.<id>.<secret>).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_-])SG\.[A-Za-z0-9_-]{16,32}\.[A-Za-z0-9_-]{16,64}(?![A-Za-z0-9_-])/g),
  },
  {
    id: 'npm_token',
    label: 'npm token',
    kind: 'api_key',
    description: 'npm access tokens (npm_ + 36 characters).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_])npm_[A-Za-z0-9]{36}(?![A-Za-z0-9_])/g),
  },
  {
    id: 'huggingface_token',
    label: 'Hugging Face token',
    kind: 'api_key',
    description: 'Hugging Face user access tokens (hf_…).',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_])hf_[A-Za-z0-9]{30,40}(?![A-Za-z0-9_])/g, { validate: (_m, v) => hasLetterAndDigit(v.slice(3)) }),
  },
  {
    id: 'twilio_key',
    label: 'Twilio SID / API key',
    kind: 'api_key',
    description: 'Twilio account SIDs (AC…) and API key SIDs (SK…) — prefix + 32 hex.',
    confidence: 'high',
    scan: regexScan(/(?<![A-Za-z0-9_])(?:AC|SK)[0-9a-f]{32}(?![A-Za-z0-9_])/g, {
      validate: (_m, v) => /[a-f]/.test(v.slice(2)) && /\d/.test(v.slice(2)),
    }),
  },
  {
    id: 'discord_token',
    label: 'Discord token',
    kind: 'api_key',
    description: 'Discord bot tokens (base64 user id . timestamp . HMAC) and Discord webhook URLs.',
    confidence: 'high',
    scan: (text, emit) => {
      regexScan(/(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{23,28})\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,40}(?![A-Za-z0-9_-])/g, {
        validate: (m) => discordIdSegmentValid(m[1]),
      })(text, emit);
      eachMatch(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,20}\/[A-Za-z0-9_-]{30,}/g, text, (m) => {
        emit(m.index, m.index + m[0].length, 'high', 'Discord webhook URL');
      });
    },
  },
  {
    id: 'url_credential',
    label: 'Credential in URL',
    kind: 'url_credential',
    description: 'user:password@ in URLs, and token/key/secret/signature query parameters.',
    confidence: 'high',
    scan: scanUrlCreds,
  },
  {
    id: 'email',
    label: 'Email address',
    kind: 'email',
    description: 'Email addresses; also OCR-spaced forms like "john . doe @ gmail . com" (medium).',
    confidence: 'high',
    scan: scanEmail,
  },
  {
    id: 'credit_card',
    label: 'Credit card number',
    kind: 'credit_card',
    description: '13–19 digit card numbers (spaces/dashes allowed) with a known network prefix and valid Luhn checksum.',
    confidence: 'high',
    scan: scanCards,
  },
  {
    id: 'iban',
    label: 'IBAN',
    kind: 'iban',
    description: 'International bank account numbers, validated by country length and mod-97.',
    confidence: 'high',
    scan: scanIban,
  },
  {
    id: 'auth_header',
    label: 'Authorization header',
    kind: 'secret_generic',
    description: 'Values of Authorization: Bearer/Basic/Token headers and bare "Bearer <token>".',
    confidence: 'medium',
    scan: scanAuth,
  },
  {
    id: 'password_assignment',
    label: 'Password',
    kind: 'password',
    description: 'Values assigned to password-like names (password=, pwd:, "passwd": "…", DB_PASSWORD=, --password …).',
    confidence: 'medium',
    scan: scanAssignments('password'),
  },
  {
    id: 'secret_assignment',
    label: 'Secret value',
    kind: 'secret_generic',
    description: 'High-entropy values assigned to secret/token/api_key-like names (key=value, key: value, JSON, env).',
    confidence: 'medium',
    scan: scanAssignments('secret'),
  },
  {
    id: 'ssn',
    label: 'US Social Security number',
    kind: 'ssn',
    description: 'US SSNs in AAA-GG-SSSS form (invalid ranges excluded); 9-digit forms only after an "SSN" label.',
    confidence: 'medium',
    scan: (text, emit) => {
      eachMatch(/(?<![\w-])(\d{3})-(\d{2})-(\d{4})(?![\w-])/g, text, (m) => {
        if (ssnValid(m[1], m[2], m[3])) emit(m.index, m.index + m[0].length);
      });
      eachMatch(
        /(?<![\w])(?:SSN|SS#|social security(?: number| no\.?| #)?)(?:\s*(?:[:#=]|is|was)\s*|\s+)((\d{3})[ -]?(\d{2})[ -]?(\d{4}))(?![\w-])/gid,
        text,
        (m) => {
          const sp = groupSpan(m, 1);
          if (sp && ssnValid(m[2], m[3], m[4])) emit(sp[0], sp[1], 'high');
        },
      );
    },
  },
  {
    id: 'phone',
    label: 'Phone number',
    kind: 'phone',
    description: 'International (+CC …) and common national formats (US, UK, DE, FR, IN, CN, JP); ≥ 8 digits; dates/versions/IPs excluded.',
    confidence: 'medium',
    scan: scanPhones,
  },
  {
    id: 'ipv4',
    label: 'IPv4 address',
    kind: 'ip_address',
    description: 'Dotted-quad IPv4 addresses with valid octets (loopback/unspecified are low confidence).',
    confidence: 'medium',
    scan: scanIpv4,
  },
  {
    id: 'ipv6',
    label: 'IPv6 address',
    kind: 'ip_address',
    description: 'Full and compressed IPv6 addresses.',
    confidence: 'medium',
    scan: regexScan(IPV6_RE, { validate: (m) => ipv6Confidence(m[0]) }),
  },
  {
    id: 'mac_address',
    label: 'MAC address',
    kind: 'mac_address',
    description: 'MAC addresses (aa:bb:cc:dd:ee:ff, aa-bb-…, aabb.ccdd.eeff).',
    confidence: 'medium',
    scan: (text, emit) => {
      const ok = (s: string) => !/^[0:.-]+$/.test(s);
      regexScan(MAC_RE, { validate: (m) => ok(m[0]) && /[0-9]/.test(m[0]) })(text, emit);
      regexScan(MAC_CISCO_RE, { validate: (m) => ok(m[0]) && /[0-9]/.test(m[0]) && /[a-fA-F]/.test(m[0]) })(text, emit);
    },
  },
  {
    id: 'bitcoin_address',
    label: 'Bitcoin address',
    kind: 'crypto_address',
    description: 'Bitcoin addresses: legacy base58check (1…/3…) and bech32/bech32m (bc1…).',
    confidence: 'low',
    scan: regexScan(/(?<![A-Za-z0-9])(?:[13][1-9A-HJ-NP-Za-km-z]{25,34}|(?:bc|tb)1[02-9ac-hj-np-z]{11,71})(?![A-Za-z0-9])/g, {
      validate: (m) => (m[0][0] === '1' || m[0][0] === '3' ? base58CheckBtcValid(m[0]) : bech32Valid(m[0])),
    }),
  },
  {
    id: 'ethereum_address',
    label: 'Ethereum address',
    kind: 'crypto_address',
    description: 'Ethereum-style addresses (0x + 40 hex).',
    confidence: 'low',
    scan: regexScan(/(?<![A-Za-z0-9])0x[0-9a-fA-F]{40}(?![A-Za-z0-9])/g, { validate: (m) => !/^0x0+$/.test(m[0]) }),
  },
];

