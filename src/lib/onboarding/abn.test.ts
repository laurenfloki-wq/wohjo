import { describe, it, expect } from 'vitest';
import { validateABN, formatABN, abnDigits } from './abn';

describe('validateABN', () => {
  it('accepts a known-valid ABN', () => {
    // Australian Bureau of Statistics ABN
    expect(validateABN('26 331 428 522')).toBe('26331428522');
    // Australian Taxation Office
    expect(validateABN('51 824 753 556')).toBe('51824753556');
  });

  it('rejects all-zeros and obviously bad values', () => {
    expect(validateABN('00000000000')).toBeNull();
    expect(validateABN('12345678901')).toBeNull();
    expect(validateABN('11111111111')).toBeNull();
  });

  it('rejects strings of wrong length', () => {
    expect(validateABN('1234567890')).toBeNull();
    expect(validateABN('123456789012')).toBeNull();
    expect(validateABN('')).toBeNull();
    expect(validateABN(null)).toBeNull();
    expect(validateABN(undefined)).toBeNull();
  });

  it('strips spaces, dashes, and parens', () => {
    expect(validateABN('26-331-428-522')).toBe('26331428522');
    expect(validateABN('(26) 331 428 522')).toBe('26331428522');
  });

  it('rejects letters or other non-digit characters in cleaned form', () => {
    expect(validateABN('26 331 428 ABC')).toBeNull();
  });
});

describe('formatABN', () => {
  it('formats to "NN NNN NNN NNN"', () => {
    expect(formatABN('26331428522')).toBe('26 331 428 522');
  });
  it('passes through if not 11 digits', () => {
    expect(formatABN('123')).toBe('123');
  });
});

describe('abnDigits', () => {
  it('strips whitespace dashes parens', () => {
    expect(abnDigits('26-331 (428) 522')).toBe('26331428522');
    expect(abnDigits('  ')).toBe('');
    expect(abnDigits(null)).toBe('');
  });
});
