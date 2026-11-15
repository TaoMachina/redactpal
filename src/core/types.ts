// Shared contracts between modules. Change only with care: detect/, image/, pdf/ and ui/ all depend on these.

/** What kind of sensitive thing a finding is. `custom` = a term the user asked to always hide. */
export type FindingKind =
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'iban'
  | 'ssn'
  | 'ip_address'
  | 'mac_address'
  | 'url_credential' // URL containing user:pass@ or a token/key query param
  | 'api_key' // provider-specific keys/tokens (AWS, GitHub, Slack, Stripe, OpenAI, ...)
  | 'private_key' // -----BEGIN ... PRIVATE KEY-----
  | 'jwt'
  | 'password' // value after password=/pwd:/passwd etc.
  | 'secret_generic' // high-entropy value assigned to key/token/secret-like names
  | 'crypto_address'
  | 'custom';

export type Confidence = 'high' | 'medium' | 'low';

/** A span of sensitive text inside a plain string. `start`/`end` are UTF-16 offsets, end exclusive. */
export interface Finding {
  id: string; // stable within one detect() call, e.g. "f3"
  start: number;
  end: number;
  text: string; // === input.slice(start, end)
  kind: FindingKind;
  ruleId: string; // e.g. "email", "aws_access_key_id", "custom"
  label: string; // human label, e.g. "Email address", "AWS access key"
  confidence: Confidence;
}

export interface DetectOptions {
  /** Extra words/phrases to always hide (case-insensitive, whole-word where possible). */
  customTerms?: string[];
  /** Rule ids to skip. */
  disabledRules?: string[];
  /** Drop findings below this confidence. Default 'low' (keep all). */
  minConfidence?: Confidence;
}

/** Axis-aligned rectangle. Units are the *source* coordinate space:
 *  - images: natural image pixels
 *  - PDF pages: CSS px of the page at scale 1 (pdf.js viewport scale 1), origin top-left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One positioned piece of text (an OCR word, or a pdf.js text item / word). */
export interface Token {
  text: string;
  box: Rect;
  /** Tokens with the same line number are joined with a single space; a new line number inserts "\n". */
  line: number;
}

/** Something that will be painted over on export. */
export interface Region {
  id: string;
  rect: Rect;
  kind: FindingKind | 'manual';
  label: string;
  findingId?: string;
  /** Text under the region (for the review list). Empty for manual boxes. */
  text: string;
  /** User can toggle a detected region off before export. Disabled regions are NOT painted. */
  enabled: boolean;
}

export type Progress = (fraction: number, message?: string) => void;

/** Result of analysing one visual page (an image, or one PDF page). */
export interface PageAnalysis {
  width: number; // source units (see Rect)
  height: number;
  tokens: Token[];
  /** Plain text built from tokens by buildLayout(); findings index into this. */
  text: string;
  findings: Finding[];
  regions: Region[];
  /** Set when this page could not be fully checked (e.g. OCR failed). The UI must show it:
   *  "nothing found" on an unread page is false reassurance. */
  warning?: string;
}
