import { describe, expect, it } from 'vitest';
import { applyPlaceholders, detect, redactText, restorePlaceholders, RULES } from '../src/detect/index';
import type { DetectOptions, Finding } from '../src/core/types';
import {
  base58CheckBtcValid,
  bech32Valid,
  cardBrand,
  ibanValid,
  ipv4Valid,
  jwtHeaderValid,
  luhn,
  sha256,
  shannonEntropy,
  ssnValid,
} from '../src/detect/validators';

// ---------- helpers ----------
const b64 = (s: string) => btoa(s);
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function find(text: string, opts?: DetectOptions): Finding[] {
  const fs = detect(text, opts);
  // invariants every result must satisfy
  for (let i = 0; i < fs.length; i++) {
    const f = fs[i];
    expect(f.id).toBe(`f${i}`);
    expect(f.text).toBe(text.slice(f.start, f.end));
    expect(f.end).toBeGreaterThan(f.start);
    if (i > 0) expect(f.start).toBeGreaterThanOrEqual(fs[i - 1].end);
  }
  return fs;
}

/** Expect exactly one finding of `ruleId` and that it equals `value`. */
function expectHit(text: string, ruleId: string, value: string, opts?: DetectOptions): Finding {
  const fs = find(text, opts).filter((f) => f.ruleId === ruleId);
  expect(fs.map((f) => f.text), `rule ${ruleId} in: ${text}`).toEqual([value]);
  return fs[0];
}

function expectNone(text: string, opts?: DetectOptions) {
  const fs = find(text, opts);
  expect(fs.map((f) => `${f.ruleId}: ${f.text}`), text).toEqual([]);
}

// Obviously fake but format-valid values.
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const GH_PAT = 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const GH_FINE = 'github_pat_11ABCDEFG0abcdefghijkl_' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2Yz3Ab4Cd5Ef6Gh7Ij8Kl9Mn0';
const GITLAB = 'glpat-Ab3dEf6hIj9kLm2nOp5q';
const SLACK = 'xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';
const SLACK_HOOK = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
const STRIPE = 'sk_test_4eC39HqLyjWDarjtT1zdp7dc';
const OPENAI = 'sk-proj-Q7xK2mN9pL4vR8sT1wY6zB3cD5fG0hJaE2rT5yU8iO1pA4sD';
const OPENAI_CLASSIC = 'sk-' + 'Zx9Wv8Ut7Sr6Qp5On4Ml3Kj2Ih1Gf0EdCbAaBbCcDdEeFf123456';
const ANTHROPIC = 'sk-ant-api03-Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv-AbCdEfGh_IjKl';
const GOOGLE = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q';
const SENDGRID = 'SG.' + 'aB1cD2eF3gH4iJ5kL6mN7o' + '.' + 'pQ8rS9tU0vW1xY2zA3bC4dE5fG6hI7jK8lM9nO0pQ1r';
const NPM = 'npm_' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1Wx2';
const HF = 'hf_' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0Uv1';
const TWILIO = 'AC' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const DISCORD = b64('123456789012345678') + '.GhIjKl.' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0';
const AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gun',
  'VTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u+qKhbwKfBstIs+bMY2Zkp18gnTxK',
  'LxoS2tFczGkPLPgizskuemMghRniWaoLcyehkd3qqGElvW/VDL5AaWTg0nLVkjRo',
  '-----END RSA PRIVATE KEY-----',
].join('\n');

// =====================================================================================
describe('validators', () => {
  it('luhn + card brand', () => {
    expect(luhn('4242424242424242')).toBe(true);
    expect(luhn('4242424242424241')).toBe(false);
    expect(cardBrand('4242424242424242')).toBe('Visa');
    expect(cardBrand('378282246310005')).toBe('American Express');
    expect(cardBrand('5555555555554444')).toBe('Mastercard');
    expect(cardBrand('1234567890123456')).toBeNull();
  });
  it('iban mod-97', () => {
    expect(ibanValid('GB82WEST12345698765432')).toBe(true);
    expect(ibanValid('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(ibanValid('GB83WEST12345698765432')).toBe(false);
    expect(ibanValid('DE89370400440532013000')).toBe(true);
    expect(ibanValid('XX82WEST12345698765432')).toBe(false);
  });
  it('entropy', () => {
    expect(shannonEntropy('aaaaaaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBeCloseTo(2);
    expect(shannonEntropy('Zx9Wv8Ut7Sr6Qp5On4Ml')).toBeGreaterThan(4);
  });
  it('jwt header', () => {
    expect(jwtHeaderValid(JWT.split('.')[0])).toBe(true);
    expect(jwtHeaderValid(b64url('{"typ":"JWT"}'))).toBe(false);
    expect(jwtHeaderValid(b64url('not json at all'))).toBe(false);
  });
  it('ipv4 / ssn', () => {
    expect(ipv4Valid('192.168.1.1')).toBe(true);
    expect(ipv4Valid('256.1.1.1')).toBe(false);
    expect(ipv4Valid('01.1.1.1')).toBe(false);
    expect(ssnValid('123', '45', '6789')).toBe(true);
    for (const [a, g, s] of [['000', '12', '3456'], ['666', '12', '3456'], ['900', '12', '3456'], ['123', '00', '4567'], ['123', '45', '0000']])
      expect(ssnValid(a, g, s)).toBe(false);
  });
  it('sha256 known vectors', () => {
    expect(hex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const long = new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq');
    expect(hex(sha256(long))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('crypto checksums', () => {
    expect(base58CheckBtcValid('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
    expect(base58CheckBtcValid('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBe(false);
    expect(bech32Valid('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(true);
    expect(bech32Valid('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toBe(false);
  });
});

// =====================================================================================
describe('RULES metadata', () => {
  it('lists every rule with id/label/kind/description', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) {
      expect(r.id).toMatch(/^[a-z0-9_]+$/);
      expect(r.label.length).toBeGreaterThan(2);
      expect(r.description.length).toBeGreaterThan(10);
      expect(r.kind).toBeTruthy();
    }
    for (const id of ['email', 'credit_card', 'iban', 'private_key', 'jwt', 'aws_access_key_id', 'github_token', 'phone', 'ipv4', 'ssn', 'password_assignment', 'secret_assignment', 'custom'])
      expect(ids).toContain(id);
  });
});

// =====================================================================================
describe('true positives', () => {
  it('email', () => {
    const f = expectHit('Contact: john.doe+work@example.co.uk, thanks', 'email', 'john.doe+work@example.co.uk');
    expect(f.kind).toBe('email');
    expect(f.confidence).toBe('high');
    expectHit('mailto:alice@example.org', 'email', 'alice@example.org');
    expectHit('Send to bob@example.com.', 'email', 'bob@example.com');
  });

  it('credit cards (Luhn, separators)', () => {
    expectHit('Card: 4242 4242 4242 4242 exp 12/29', 'credit_card', '4242 4242 4242 4242');
    expectHit('card=4111-1111-1111-1111;', 'credit_card', '4111-1111-1111-1111');
    expectHit('Amex 3782 822463 10005', 'credit_card', '3782 822463 10005');
    expectHit('MC 5555555555554444.', 'credit_card', '5555555555554444');
    expect(find('Card: 4242 4242 4242 4241').filter((f) => f.ruleId === 'credit_card')).toEqual([]);
  });

  it('IBAN (compact and grouped)', () => {
    expectHit('IBAN: GB82WEST12345698765432 (Barclays)', 'iban', 'GB82WEST12345698765432');
    expectHit('IBAN DE89 3704 0044 0532 0130 00 bitte', 'iban', 'DE89 3704 0044 0532 0130 00');
    expectHit('FR1420041010050500013M02606', 'iban', 'FR1420041010050500013M02606');
    expect(find('GB83WEST12345698765432').filter((f) => f.ruleId === 'iban')).toEqual([]);
  });

  it('private key blocks (multi-line, truncated)', () => {
    const f = expectHit(`config:\n${PEM}\nend`, 'private_key', PEM);
    expect(f.kind).toBe('private_key');
    const openssh = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----';
    expectHit(openssh, 'private_key', openssh);
    const truncated = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\nVJTUt9Us8cKjMzEfYyji';
    expectHit(truncated + '\n\nSome other text here.', 'private_key', truncated);
  });

  it('JWT', () => {
    const f = expectHit(`token ${JWT} end`, 'jwt', JWT);
    expect(f.kind).toBe('jwt');
    // Looks like a JWT but header lacks "alg" -> not a JWT
    const fake = `${b64url('{"typ":"JWT","x":1}')}.${b64url('{"sub":"1"}')}.abc`;
    expect(find(fake).filter((x) => x.ruleId === 'jwt')).toEqual([]);
  });

  it('AWS', () => {
    expectHit('aws_access_key_id = AKIAIOSFODNN7EXAMPLE', 'aws_access_key_id', 'AKIAIOSFODNN7EXAMPLE');
    expectHit('ASIAY34FZKBOKMUTVV7A', 'aws_access_key_id', 'ASIAY34FZKBOKMUTVV7A');
    expectHit(`aws_secret_access_key = ${AWS_SECRET}`, 'aws_secret_access_key', AWS_SECRET);
    expectHit(`"SecretAccessKey": "${AWS_SECRET}"`, 'aws_secret_access_key', AWS_SECRET);
  });

  it('provider tokens', () => {
    const cases: Array<[string, string]> = [
      [GH_PAT, 'github_token'],
      ['gho_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'github_token'],
      ['ghs_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'github_token'],
      ['ghu_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'github_token'],
      ['ghr_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8', 'github_token'],
      [GH_FINE, 'github_token'],
      [GITLAB, 'gitlab_token'],
      [SLACK, 'slack_token'],
      ['xoxp-1234567890-0987654321-AbCdEf123456', 'slack_token'],
      [SLACK_HOOK, 'slack_webhook'],
      [STRIPE, 'stripe_key'],
      ['rk_live_' + 'Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8', 'stripe_key'],
      ['pk_test_' + 'TYooMQauvdEDq54NiTphI7jx', 'stripe_key'],
      [OPENAI, 'openai_key'],
      [OPENAI_CLASSIC, 'openai_key'],
      [ANTHROPIC, 'anthropic_key'],
      [GOOGLE, 'google_api_key'],
      [SENDGRID, 'sendgrid_key'],
      [NPM, 'npm_token'],
      [HF, 'huggingface_token'],
      [TWILIO, 'twilio_key'],
      ['SK' + 'a1b2c3d4e5f60718293a4b5c6d7e8f90', 'twilio_key'],
      [DISCORD, 'discord_token'],
      ['https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdef', 'discord_token'],
    ];
    for (const [value, rule] of cases) {
      const f = expectHit(`key: ${value}\n`, rule, value);
      expect(f.kind).toBe('api_key');
      expect(f.confidence).toBe('high');
      // also inside other text
      expectHit(`Here is my token (${value}) please don't share`, rule, value);
    }
  });

  it('URL credentials', () => {
    const f = expectHit('DATABASE_URL=postgres://admin:s3cr3t@db.example.com:5432/app', 'url_credential', 'admin:s3cr3t');
    expect(f.kind).toBe('url_credential');
    expectHit('GET https://api.example.com/v1/items?api_key=abcd1234efgh5678&page=2', 'url_credential', 'abcd1234efgh5678');
    expectHit('https://example.com/cb#access_token=ya29.a0AfH6SMBx1234&expires_in=3599', 'url_credential', 'ya29.a0AfH6SMBx1234');
    expectHit('https://bucket.s3.amazonaws.com/f.pdf?X-Amz-Signature=8f2c1e9d7b6a5f4e3d2c1b0a', 'url_credential', '8f2c1e9d7b6a5f4e3d2c1b0a');
  });

  it('Authorization headers', () => {
    const f = expectHit('Authorization: Bearer abcdef1234567890ghijklmnop', 'auth_header', 'abcdef1234567890ghijklmnop');
    expect(f.confidence).toBe('medium');
    expectHit('Authorization: Basic dXNlcjpwYXNzd29yZA==', 'auth_header', 'dXNlcjpwYXNzd29yZA==');
    expectHit('curl -H "Authorization: Token 9f8e7d6c5b4a39281706"', 'auth_header', '9f8e7d6c5b4a39281706');
    // a JWT bearer is reported as the more specific JWT
    expectHit(`Authorization: Bearer ${JWT}`, 'jwt', JWT);
  });

  it('password assignments cover only the value', () => {
    const cases: Array<[string, string]> = [
      ['password=hunter2', 'hunter2'],
      ['password: hunter2', 'hunter2'],
      ['Password : hunter2', 'hunter2'],
      ['{"password": "correct horse battery staple"}', 'correct horse battery staple'],
      ["'passwd': 'p@ss w0rd!'", 'p@ss w0rd!'],
      ['DB_PASSWORD=S3cr3t!Pass', 'S3cr3t!Pass'],
      ['export MYSQL_ROOT_PASSWORD="r00tPa55"', 'r00tPa55'],
      ['spring.datasource.password = Tr0ub4dor&3', 'Tr0ub4dor&3'],
      ['pwd: letmein123', 'letmein123'],
      ['mysql --password hunter22 -u root', 'hunter22'],
      ['user_pass=qwerty123', 'qwerty123'],
      ['<password>xyzzy42</password>', 'xyzzy42'],
      ['login?user=bob&password=hunter2&x=1', 'hunter2'],
    ];
    for (const [text, value] of cases) {
      const fs = find(text).filter((f) => f.kind === 'password' || f.kind === 'url_credential');
      expect(fs.map((f) => f.text), text).toEqual([value]);
    }
  });

  it('secret / token / api_key assignments (entropy-gated)', () => {
    const cases: Array<[string, string]> = [
      ['api_key=9f8e7d6c5b4a39281706f5e4', '9f8e7d6c5b4a39281706f5e4'],
      ['"apiKey": "Zx9Wv8Ut7Sr6Qp5On4Ml3Kj2"', 'Zx9Wv8Ut7Sr6Qp5On4Ml3Kj2'],
      ['client_secret: 7d1f0c9e8b2a4f6d3c5e', '7d1f0c9e8b2a4f6d3c5e'],
      ['JWT_SECRET=q8W!e7R@t6Y#u5I$', 'q8W!e7R@t6Y#u5I$'],
      ['x-api-key: a1B2c3D4e5F6g7H8', 'a1B2c3D4e5F6g7H8'],
      ['access_token = "4f3c2b1a0e9d8c7b6a5f"', '4f3c2b1a0e9d8c7b6a5f'],
      ['SECRET_KEY_BASE=8c1f2e3d4c5b6a7980f1e2d3', '8c1f2e3d4c5b6a7980f1e2d3'],
    ];
    for (const [text, value] of cases) {
      const f = expectHit(text, 'secret_assignment', value);
      expect(f.kind).toBe('secret_generic');
    }
    // low entropy / placeholder values are ignored
    expectNone('token = "aaaaaaaaaaaa"');
    expectNone('api_key = "YOUR_API_KEY"');
    expectNone('secret: ${SECRET}');
    expectNone('token: <token>');
  });

  it('provider key wins over the generic assignment rule', () => {
    expectHit(`STRIPE_SECRET_KEY=${STRIPE}`, 'stripe_key', STRIPE);
    expectHit(`GITHUB_TOKEN=${GH_PAT}`, 'github_token', GH_PAT);
    expect(find(`GITHUB_TOKEN=${GH_PAT}`)).toHaveLength(1);
  });

  it('phones: international', () => {
    for (const p of ['+1 415 555 2671', '+1 (415) 555-2671', '+44 20 7946 0958', '+44 (0)20 7946 0958', '+49 30 12345678', '+33 1 23 45 67 89', '+91 98765 43210', '+86 138 0013 8000', '+81 3-1234-5678', '+14155552671', '0049 30 1234567']) {
      const f = expectHit(`Call ${p} today`, 'phone', p);
      expect(f.confidence).toBe('medium');
      expect(f.kind).toBe('phone');
    }
  });

  it('phones: national formats', () => {
    for (const p of ['(555) 123-4567', '555-123-4567', '415.555.2671', '1-800-555-1234', '020 7946 0958', '07700 900123', '0161 496 0000', '030 12345678', '0151 23456789', '030/1234567', '01 23 45 67 89', '01.23.45.67.89', '98765 43210', '138 0013 8000', '138-0013-8000', '13800138000', '03-1234-5678', '090-1234-5678', '0120-123-456']) {
      expectHit(`Tel: ${p}.`, 'phone', p);
    }
    expectHit('电话13800138000联系', 'phone', '13800138000');
  });

  it('IP and MAC addresses', () => {
    expectHit('client 203.0.113.42 connected', 'ipv4', '203.0.113.42');
    expectHit('from 10.0.0.12:443', 'ipv4', '10.0.0.12');
    const lo = expectHit('listening on 127.0.0.1:8080', 'ipv4', '127.0.0.1');
    expect(lo.confidence).toBe('low');
    // spec section numbers: skipped after "section"/"§"…, low confidence otherwise
    expectNone('See section 12.7.5.2 and § 8.6.4.4 of the spec.');
    expect(expectHit('(PDF 32000-1:2008, 8.6.4.4)', 'ipv4', '8.6.4.4').confidence).toBe('low');
    expectHit('addr 2001:db8::8a2e:370:7334 ok', 'ipv6', '2001:db8::8a2e:370:7334');
    expectHit('fe80::1ff:fe23:4567:890a%eth0', 'ipv6', 'fe80::1ff:fe23:4567:890a');
    expectHit('2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'ipv6', '2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    expectHit('ether 00:1A:2B:3C:4D:5E', 'mac_address', '00:1A:2B:3C:4D:5E');
    expectHit('MAC 00-1a-2b-3c-4d-5e', 'mac_address', '00-1a-2b-3c-4d-5e');
    expectHit('mac 001a.2b3c.4d5e', 'mac_address', '001a.2b3c.4d5e');
  });

  it('SSN with invalid ranges excluded', () => {
    expectHit('SSN: 123-45-6789', 'ssn', '123-45-6789');
    expectHit('my social security number is 123456789', 'ssn', '123456789');
    for (const bad of ['000-12-3456', '666-12-3456', '900-12-3456', '123-00-4567', '123-45-0000'])
      expect(find(`id ${bad}`).filter((f) => f.ruleId === 'ssn'), bad).toEqual([]);
  });

  it('crypto addresses (low)', () => {
    const f = expectHit('send to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa thx', 'bitcoin_address', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(f.confidence).toBe('low');
    expectHit('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bitcoin_address', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    expectHit('eth 0x52908400098527886E0F7030069857D2E4169EE7', 'ethereum_address', '0x52908400098527886E0F7030069857D2E4169EE7');
    expect(find('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb').filter((x) => x.ruleId === 'bitcoin_address')).toEqual([]);
  });
});

// =====================================================================================
describe('custom terms', () => {
  it('case-insensitive, whole-word, label', () => {
    const text = 'Project Falcon is led by ACME; acme-corp and Acmeville are different. Falcons fly.';
    const fs = find(text, { customTerms: ['acme', 'project falcon'] });
    expect(fs.map((f) => f.text)).toEqual(['Project Falcon', 'ACME', 'acme']);
    expect(fs[0].kind).toBe('custom');
    expect(fs[0].ruleId).toBe('custom');
    expect(fs[0].confidence).toBe('high');
    expect(fs[0].label).toBe('Custom: project falcon');
    expect(fs[1].label).toBe('Custom: acme');
  });
  it('escapes regex specials, handles non-word edges and multi-space', () => {
    expect(find('I like C++ and c++ (not C)', { customTerms: ['C++'] }).map((f) => f.text)).toEqual(['C++', 'c++']);
    expect(find('cost (a.b) vs aXb', { customTerms: ['a.b'] }).map((f) => f.text)).toEqual(['a.b']);
    expect(find('Project\n  Falcon', { customTerms: ['Project Falcon'] }).map((f) => f.text)).toEqual(['Project\n  Falcon']);
    expect(find('张三说你好', { customTerms: ['张三'] }).map((f) => f.text)).toEqual(['张三']);
    expect(find('Héloïse et héloïse', { customTerms: ['HÉLOÏSE'] })).toHaveLength(2);
  });
  it('empty / duplicate terms are ignored; custom can be disabled', () => {
    expect(find('abc', { customTerms: ['', '   '] })).toEqual([]);
    expect(find('foo foo', { customTerms: ['foo', 'FOO'] })).toHaveLength(2);
    expect(find('foo', { customTerms: ['foo'], disabledRules: ['custom'] })).toEqual([]);
  });
});

// =====================================================================================
describe('options & overlap resolution', () => {
  it('disabledRules', () => {
    expect(find('john@example.com', { disabledRules: ['email'] })).toEqual([]);
    expect(find('john@example.com 4242 4242 4242 4242', { disabledRules: ['credit_card'] }).map((f) => f.ruleId)).toEqual(['email']);
  });
  it('minConfidence', () => {
    const text = 'john@example.com +1 415 555 2671 127.0.0.1';
    expect(find(text).map((f) => f.confidence)).toEqual(['high', 'medium', 'low']);
    expect(find(text, { minConfidence: 'medium' }).map((f) => f.ruleId)).toEqual(['email', 'phone']);
    expect(find(text, { minConfidence: 'high' }).map((f) => f.ruleId)).toEqual(['email']);
  });
  it('higher confidence beats longer; ids sequential; sorted', () => {
    // custom (high) inside a password value (medium): the high finding wins
    const fs = find('password=acmeSecret99', { customTerms: ['acmeSecret99'] });
    expect(fs.map((f) => f.ruleId)).toEqual(['custom']);
    const many = find('a@b.co x c@d.io 4242424242424242');
    expect(many.map((f) => f.id)).toEqual(['f0', 'f1', 'f2']);
  });
  it('url credential covers user:pass instead of an email-looking fragment', () => {
    const fs = find('mongodb://root:hunter2@cluster0.example.net/db');
    expect(fs.map((f) => `${f.ruleId}:${f.text}`)).toEqual(['url_credential:root:hunter2']);
  });
  it('empty input', () => {
    expect(detect('')).toEqual([]);
  });
});

// =====================================================================================
describe('OCR-noisy input', () => {
  it('spaced emails', () => {
    const f = expectHit('Email: john . doe @ gmail . com', 'email', 'john . doe @ gmail . com');
    expect(f.confidence).toBe('medium');
    expectHit('mail jane@ example.com now', 'email', 'jane@ example.com');
    expectHit('contact support @ acme-corp . io for help', 'email', 'support @ acme-corp . io');
    // but not prose that merely contains "@" and dots
    expectNone('meet me @ the office. Then lunch.');
    expectNone('I am at home. Call me @ 5. Com on.');
  });
  it('cards split by spaces / odd grouping', () => {
    expectHit('VISA 42424 24242 424242', 'credit_card', '42424 24242 424242');
    expectHit('4242 4242 4242 4242', 'credit_card', '4242 4242 4242 4242');
  });
  it('OCR screenshot of a settings page', () => {
    const text = [
      'Account settings',
      'Name  John Doe',
      'Email  john.doe@example.com',
      'Phone  +1 (415) 555-2671',
      'Password : hunter2',
      'API key  sk_test_4eC39HqLyjWDarjtT1zdp7dc',
      'Last login 2026-11-15 10:30 from 203.0.113.42',
    ].join('\n');
    const fs = find(text);
    expect(fs.map((f) => `${f.ruleId}:${f.text}`)).toEqual([
      'email:john.doe@example.com',
      'phone:+1 (415) 555-2671',
      'password_assignment:hunter2',
      'stripe_key:sk_test_4eC39HqLyjWDarjtT1zdp7dc',
      'ipv4:203.0.113.42',
    ]);
  });
});

// =====================================================================================
describe('false positives', () => {
  it('dates, times, versions, numbers', () => {
    expectNone('Released 2026-11-15 at 10:30:00, see 15.11.2026 and 11/15/2026.');
    expectNone('2026-11-15T10:30:00.123Z');
    expectNone('Upgrade from v1.2.3 to 1.2.4 (build 1.2.3.4567), Node 20.11.1, Chrome/120.0.6099.109');
    expectNone('Total: $1,234.56 or €1.234,56 or USD 12,345,678.90 or 1 234 567,89 €');
    expectNone('Order #12345678 shipped; tracking 1Z999AA10123456784; ISBN 978-3-16-148410-0');
    expectNone('Population 1234567890, ratio 3.14159265, coords 37.7749295,-122.4194155');
    expectNone('took 1500 ms (attempt 3/5), pid 12345, port 8080, exit code 137');
    expectNone('Unix time 1731628800, ms 1731628800000');
  });

  it('identifiers in code', () => {
    expectNone('const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"; // uuid 550e8400-e29b-41d4-a716-446655440000');
    expectNone('commit 9fceb02d0ae598e95dc970b74767f19372d61af8\nMerge: 1a2b3c4 5d6e7f8');
    expectNone('.btn { color: #ff0000; background: #1a2b3c; border-color: #FFF; }');
    expectNone('std::vector<int> v; Foo::Bar::baz(); a ? b : c; http://localhost:3000/api');
    expectNone(
      [
        'const password = getPassword();',
        'const token = await auth.getToken();',
        'type User = { password: string; token?: string; apiKey: string };',
        'const maxTokens = 4096;',
        'password = input;',
        'if (password === confirm) {}',
        'def login(password: str) -> bool:',
        'secret_name: my-k8s-secret',
        'token_type: "bearer"',
        'password_min_length: 12',
        'password: process.env.DB_PASSWORD',
        'api_key: ${API_KEY}',
        'PASSWORD=',
        'password: "********"',
      ].join('\n'),
    );
    expectNone('import { createHash } from "node:crypto"; const sha = createHash("sha256");');
    // regressions found by scanning node_modules
    expectNone('<path d="M142.993 9.09091C142.993 4.07014 138.934 0 133.927 0H21.9592Z"/>');
    expectNone('C=(B=(+((i=i+1|0)>>>0)+4294967296*+((a=i?a:a+1|0)>>>0');
    expectNone('pdfjs-password-invalid = Invalid password. Please try again.');
    expectNone('const PermissionFlag = { PASSWORD: 0x0002000, NEED_PASSWORD: 1 };');
    expectNone('fetch(url, { credentials: "same-origin" }); function f(token: TokenOrValue) {}');
    expectNone('const msg = { password: "OK\\npdfjs-password-cancel-button" };');
    expectNone('opts = {password:return x}');
    expectNone('?token=|key=|secret=|sig=|access_token=');
    expectNone('git@github.com:org/repo.git');
    expectNone('icon@2x.png and logo@3x.webp');
  });

  it('prose and lorem ipsum', () => {
    expectNone(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    );
    expectNone(
      'The quick brown fox jumps over the lazy dog. Please reset your password if you forgot it. ' +
        'Your password must be at least 12 characters. Forgot password? Click here. The token economy is growing. ' +
        'In 2025 we sold 1,200 units; in 2026, 3,400. Meeting at 10:30 in room 4.12.',
    );
    expectNone('Password: required\nPassword: ••••••••\nPassword: click to reveal');
  });

  it('typical log output without secrets', () => {
    expectNone(
      [
        '2026-11-15T10:30:00.123Z INFO  [main] Server started on port 8080 (pid 12345)',
        '2026-11-15 10:30:01,456 DEBUG request id=7f3a9c2e-1b4d-4e8f-9a6b-2c5d8e1f0a3b took 123ms',
        '[2026-11-15 10:30:02] GET /api/v1/users?page=2&limit=50 200 15.3ms',
        'WARN: retrying in 1500 ms (attempt 3/5)',
        'Build 1.2.3+456 finished in 00:01:23',
        'Memory: 1234567890 bytes used, heap 512MB, gc pause 12.5ms',
        'at Object.<anonymous> (/app/src/index.js:42:17)',
        'npm WARN deprecated inflight@1.0.6: This module is not supported',
        'Downloading https://registry.npmjs.org/react/-/react-18.3.1.tgz',
        'sha512-AbCdEf==  integrity check passed; tokens processed: 4096',
      ].join('\n'),
    );
  });
});

// =====================================================================================
describe('placeholders & redaction', () => {
  const text = 'Mail john@example.com or JOHN@example.com, call +1 415 555 2671. Again john@example.com. Key: ' + STRIPE + ' ACME';
  const findings = detect(text, { customTerms: ['acme'] });

  it('applyPlaceholders numbers per kind and reuses for equal values', () => {
    const { text: out, mapping } = applyPlaceholders(text, findings);
    expect(out).toBe('Mail [EMAIL_1] or [EMAIL_2], call [PHONE_1]. Again [EMAIL_1]. Key: [API_KEY_1] [CUSTOM_1]');
    expect(mapping).toEqual({
      '[EMAIL_1]': 'john@example.com',
      '[EMAIL_2]': 'JOHN@example.com',
      '[PHONE_1]': '+1 415 555 2671',
      '[API_KEY_1]': STRIPE,
      '[CUSTOM_1]': 'ACME',
    });
  });

  it('round-trip restore, tolerant of case/spacing/markdown escapes', () => {
    const { text: out, mapping } = applyPlaceholders(text, findings);
    expect(restorePlaceholders(out, mapping)).toBe(text);
    const aiReply = 'Sure! I emailed [email_1] and [ EMAIL_2 ], phoned [Phone 1], rotated \\[API\\_KEY\\_1\\] for [CUSTOM_1]. Unknown [EMAIL_9] stays.';
    expect(restorePlaceholders(aiReply, mapping)).toBe(
      `Sure! I emailed john@example.com and JOHN@example.com, phoned +1 415 555 2671, rotated ${STRIPE} for ACME. Unknown [EMAIL_9] stays.`,
    );
  });

  it('does not mint placeholders that already exist in the input', () => {
    const t = 'Template [EMAIL_1] vs real bob@example.com';
    const { text: out, mapping } = applyPlaceholders(t, detect(t));
    expect(out).toBe('Template [EMAIL_1] vs real [EMAIL_2]');
    expect(mapping).toEqual({ '[EMAIL_2]': 'bob@example.com' });
  });

  it('redactText label / block', () => {
    expect(redactText(text, findings, 'label')).toBe(
      'Mail [REDACTED EMAIL] or [REDACTED EMAIL], call [REDACTED PHONE]. Again [REDACTED EMAIL]. Key: [REDACTED API KEY] [REDACTED CUSTOM]',
    );
    expect(redactText(text, findings)).toBe(redactText(text, findings, 'label'));
    const blocked = redactText(text, findings, 'block');
    expect(blocked.length).toBe(text.length);
    expect(blocked).toContain('Mail ████████████████ or');
    const pemText = `key:\n${PEM}\n`;
    const pb = redactText(pemText, detect(pemText), 'block');
    expect(pb.length).toBe(pemText.length);
    expect(pb.split('\n').length).toBe(pemText.split('\n').length);
    expect(pb).not.toMatch(/PRIVATE|MIIE/);
  });
});

// =====================================================================================
describe('performance', () => {
  it('1 MB of mixed text in well under a second', () => {
    const chunk =
      'Lorem ipsum dolor sit amet 2026-11-15 10:30:00 v1.2.3 id=7f3a9c2e-1b4d-4e8f-9a6b-2c5d8e1f0a3b ' +
      'user john.doe@example.com called +1 415 555 2671 from 203.0.113.42 password=hunter2 ' +
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1111111111111111111111111111111 ' +
      'eyJhbGciOiJIUzI1NiJ9 sk-not-a-key ghp_short ---- ::::: .... @@@@ 12 34 56 78 90 12 34 56\n';
    let big = '';
    while (big.length < 1_000_000) big += chunk;
    const t0 = performance.now();
    const fs = detect(big, { customTerms: ['Lorem', 'Falcon'] });
    const ms = performance.now() - t0;
    expect(fs.length).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(1000);
  });

  it('pathological inputs do not backtrack catastrophically', () => {
    const cases = [
      'a'.repeat(200_000),
      '1'.repeat(200_000),
      '1 '.repeat(100_000),
      'a.'.repeat(100_000) + '@',
      'a@'.repeat(100_000),
      ':'.repeat(100_000),
      'ab:'.repeat(60_000),
      '-----BEGIN PRIVATE KEY-----\n' + 'A'.repeat(100_000),
      'password='.repeat(30_000),
      'eyJ' + 'a'.repeat(200_000),
      ('x' + ' . '.repeat(5)).repeat(20_000) + '@',
      '+1 '.repeat(60_000),
    ];
    for (const c of cases) {
      const t0 = performance.now();
      detect(c);
      expect(performance.now() - t0, c.slice(0, 20)).toBeLessThan(1000);
    }
  });
});
