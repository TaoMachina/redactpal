// Display metadata for finding kinds: short chip labels and a colour "tone". Pure, no DOM.
import type { FindingKind } from '../core/types';

export type RegionKind = FindingKind | 'manual';
export type Tone = 'secret' | 'contact' | 'money' | 'network' | 'custom' | 'manual';

interface KindInfo {
  short: string;
  plural: string;
  tone: Tone;
}

const INFO: Record<RegionKind, KindInfo> = {
  email: { short: 'Email', plural: 'Emails', tone: 'contact' },
  phone: { short: 'Phone', plural: 'Phone numbers', tone: 'contact' },
  credit_card: { short: 'Card', plural: 'Card numbers', tone: 'money' },
  iban: { short: 'IBAN', plural: 'Bank accounts (IBAN)', tone: 'money' },
  bank_account: { short: 'Account', plural: 'Bank account numbers', tone: 'money' },
  ssn: { short: 'SSN', plural: 'Social security numbers', tone: 'money' },
  ip_address: { short: 'IP', plural: 'IP addresses', tone: 'network' },
  mac_address: { short: 'MAC', plural: 'MAC addresses', tone: 'network' },
  url_credential: { short: 'Secret URL', plural: 'URLs with secrets', tone: 'secret' },
  api_key: { short: 'API key', plural: 'API keys & tokens', tone: 'secret' },
  private_key: { short: 'Private key', plural: 'Private keys', tone: 'secret' },
  jwt: { short: 'Token', plural: 'Login tokens (JWT)', tone: 'secret' },
  password: { short: 'Password', plural: 'Passwords', tone: 'secret' },
  secret_generic: { short: 'Secret', plural: 'Other secrets', tone: 'secret' },
  crypto_address: { short: 'Wallet', plural: 'Crypto addresses', tone: 'money' },
  custom: { short: 'Hidden everywhere', plural: 'Hidden everywhere', tone: 'custom' },
  manual: { short: 'Your box', plural: 'Boxes you drew', tone: 'manual' },
};

const FALLBACK: KindInfo = { short: 'Sensitive', plural: 'Other', tone: 'secret' };

export function kindInfo(kind: string): KindInfo {
  return (INFO as Record<string, KindInfo>)[kind] ?? FALLBACK;
}

export const shortLabel = (kind: string): string => kindInfo(kind).short;
export const toneOf = (kind: string): Tone => kindInfo(kind).tone;
