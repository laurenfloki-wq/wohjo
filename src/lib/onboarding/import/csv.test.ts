// CSV parser tests — RFC 4180 corner cases that real provider exports
// hit in practice.

import { describe, it, expect } from 'vitest';
import { parseCsv, headerIndex, pick } from './csv';

describe('parseCsv', () => {
  it('returns empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('parses a basic two-row CSV', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('strips a UTF-8 BOM at the start of the file', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(parseCsv(`${bom}a,b\n1,2`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves quoted fields containing commas', () => {
    expect(parseCsv('a,b\n"smith, john",1')).toEqual([
      ['a', 'b'],
      ['smith, john', '1'],
    ]);
  });

  it('handles doubled-double-quote escape inside quoted field', () => {
    expect(parseCsv('a,b\n"he said ""hi""",1')).toEqual([
      ['a', 'b'],
      ['he said "hi"', '1'],
    ]);
  });

  it('preserves leading zeros in quoted fields (employee-id pattern)', () => {
    expect(parseCsv('id,name\n"00123",alex')).toEqual([
      ['id', 'name'],
      ['00123', 'alex'],
    ]);
  });

  it('throws on unterminated quoted field', () => {
    expect(() => parseCsv('a,b\n"unterminated,1')).toThrow(/unterminated/);
  });

  it('treats stray quote in unquoted field as literal', () => {
    expect(parseCsv('a,b\nfoo",1')).toEqual([
      ['a', 'b'],
      ['foo"', '1'],
    ]);
  });

  it('handles trailing newline without producing extra empty row', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('preserves an empty trailing field', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('headerIndex', () => {
  it('builds case-insensitive header lookup', () => {
    const m = headerIndex(['First Name', 'Mobile Number', 'Email']);
    expect(m.get('first name')).toBe(0);
    expect(m.get('FIRST NAME')?.toString()).toBeUndefined(); // upper-case key not present
    expect(m.get('mobile number')).toBe(1);
    expect(m.get('email')).toBe(2);
  });

  it('trims whitespace in headers', () => {
    const m = headerIndex(['  First Name  ', 'Email']);
    expect(m.get('first name')).toBe(0);
  });

  it('skips empty headers', () => {
    const m = headerIndex(['First Name', '', 'Email']);
    expect(m.size).toBe(2);
  });
});

describe('pick', () => {
  const headers = headerIndex(['First Name', 'Mobile', 'Email']);

  it('returns the first non-empty matching alias', () => {
    expect(pick(['Alex', '0413573579', 'alex@e.com'], headers, ['Mobile Number', 'Mobile'])).toBe(
      '0413573579',
    );
  });

  it('returns null when no alias matches', () => {
    expect(pick(['Alex', '', ''], headers, ['Pay Rate'])).toBeNull();
  });

  it('returns null when matched column is empty', () => {
    expect(pick(['Alex', '   ', 'alex@e.com'], headers, ['Mobile'])).toBeNull();
  });

  it('trims whitespace from picked value', () => {
    expect(pick(['  Alex  ', '', ''], headers, ['First Name'])).toBe('Alex');
  });
});
