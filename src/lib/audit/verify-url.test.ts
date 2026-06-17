import { describe, it, expect } from 'vitest';
import {
  isValidVerifyToken,
  verifyUrl,
  parseVerifyToken,
  isValidReceipt,
  classifyVerifyQuery,
} from './verify-url';

const HASH = 'b3569353caaff84f9150c83c8dafc14de54e14989a9e159f56d0b0bf01f39aea';

describe('isValidVerifyToken', () => {
  it('accepts a 64-char lowercase hex hash', () => {
    expect(isValidVerifyToken(HASH)).toBe(true);
  });
  it('rejects wrong length, uppercase, or non-hex', () => {
    expect(isValidVerifyToken(HASH.slice(0, 63))).toBe(false);
    expect(isValidVerifyToken(HASH.toUpperCase())).toBe(false);
    expect(isValidVerifyToken('z'.repeat(64))).toBe(false);
    expect(isValidVerifyToken('')).toBe(false);
  });
});

describe('verifyUrl', () => {
  it('builds an absolute /verify/<token> URL', () => {
    expect(verifyUrl(HASH)).toMatch(new RegExp(`/verify/${HASH}$`));
  });
});

describe('parseVerifyToken', () => {
  it('accepts a bare hash', () => {
    expect(parseVerifyToken(HASH)).toBe(HASH);
  });
  it('trims surrounding whitespace', () => {
    expect(parseVerifyToken(`  ${HASH}\n`)).toBe(HASH);
  });
  it('lowercases an uppercase hash', () => {
    expect(parseVerifyToken(HASH.toUpperCase())).toBe(HASH);
  });
  it('extracts the token from a full verify URL (with query)', () => {
    expect(parseVerifyToken(`https://flosmosis.com/verify/${HASH}?format=json`)).toBe(HASH);
  });
  it('returns null for junk or a partial hash', () => {
    expect(parseVerifyToken('not a hash')).toBeNull();
    expect(parseVerifyToken(HASH.slice(0, 40))).toBeNull();
    expect(parseVerifyToken('')).toBeNull();
  });
});

describe('isValidReceipt', () => {
  it('accepts FSTR codes case-insensitively', () => {
    expect(isValidReceipt('FSTR-C3LMPJYS')).toBe(true);
    expect(isValidReceipt('  fstr-c3lmpjys ')).toBe(true);
  });
  it('rejects non-receipts', () => {
    expect(isValidReceipt('C3LMPJYS')).toBe(false);
    expect(isValidReceipt('FSTR-')).toBe(false);
    expect(isValidReceipt('XXXX-12345678')).toBe(false);
  });
});

describe('classifyVerifyQuery', () => {
  it('classifies a hash and a verify link as hash', () => {
    expect(classifyVerifyQuery(HASH)).toEqual({ kind: 'hash', value: HASH });
    expect(classifyVerifyQuery(`https://x/verify/${HASH}?format=json`)).toEqual({
      kind: 'hash',
      value: HASH,
    });
  });
  it('classifies a receipt code (normalised upper-case)', () => {
    expect(classifyVerifyQuery('fstr-c3lmpjys')).toEqual({
      kind: 'receipt',
      value: 'FSTR-C3LMPJYS',
    });
  });
  it('returns null for unrecognised input', () => {
    expect(classifyVerifyQuery('hello')).toBeNull();
    expect(classifyVerifyQuery('')).toBeNull();
  });
});
