import { describe, expect, it } from 'vitest';
import { applyPlaceholders, detect } from '../src/detect';

const bank = (t: string) => detect(t).filter((f) => f.kind === 'bank_account').map((f) => f.text);

describe('bank account numbers', () => {
  it('finds labelled account numbers, masked or not', () => {
    expect(bank('Account number: 12345678')).toEqual(['12345678']);
    expect(bank('Acct 3192 6819 0042')).toEqual(['3192 6819 0042']);
    expect(bank('A/C No. ****1234')).toEqual(['****1234']);
  });
  it('finds checksum-valid routing numbers and sort codes', () => {
    expect(bank('Routing number: 021000021')).toEqual(['021000021']);
    expect(bank('ABA 123456789')).toEqual([]); // fails the checksum
    expect(bank('Sort code: 20-00-00')).toEqual(['20-00-00']);
  });
  it('leaves ordinary text alone', () => {
    expect(bank('Account summary for November')).toEqual([]);
    expect(bank('My account was created in 2019')).toEqual([]);
    expect(bank('Sort the codes by date')).toEqual([]);
  });
  it('becomes an [ACCOUNT_1] placeholder', () => {
    const t = 'Account number: 12345678';
    expect(applyPlaceholders(t, detect(t)).text).toBe('Account number: [ACCOUNT_1]');
  });
});
