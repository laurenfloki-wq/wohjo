// normaliseRow + parsePayRate tests.

import { describe, it, expect } from 'vitest';
import { normaliseRow, parsePayRate } from './base';

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';

function rawRow(overrides: Partial<Parameters<typeof normaliseRow>[0]> = {}) {
  return {
    source_row: 2,
    first_name: 'Joao',
    last_name: 'Muniz',
    phone: '0413573579',
    email: 'joao@example.test',
    employee_id: 'EMP-001',
    pay_rate: '28.47',
    award_classification: 'CW3',
    ...overrides,
  };
}

describe('normaliseRow — happy path', () => {
  it('produces a canonical WorkerImportRow from clean inputs', () => {
    const result = normaliseRow(rawRow(), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row).toEqual({
        company_id: COMPANY_ID,
        source_row: 2,
        first_name: 'Joao',
        last_name: 'Muniz',
        phone: '+61413573579',
        email: 'joao@example.test',
        employee_id: 'EMP-001',
        pay_rate: '28.47',
        award_classification: 'CW3',
      });
    }
  });

  it('normalises phone from +61 international format', () => {
    const result = normaliseRow(rawRow({ phone: '+61413573579' }), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.phone).toBe('+61413573579');
  });

  it('normalises phone from Auth-format (no plus)', () => {
    const result = normaliseRow(rawRow({ phone: '61413573579' }), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.phone).toBe('+61413573579');
  });

  it('normalises pay rate "$28.47" → "28.47"', () => {
    const result = normaliseRow(rawRow({ pay_rate: '$28.47' }), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.pay_rate).toBe('28.47');
  });

  it('expands integer pay rate "28" to 2dp "28.00"', () => {
    const result = normaliseRow(rawRow({ pay_rate: '28' }), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row.pay_rate).toBe('28.00');
  });

  it('treats empty email and award_classification as null', () => {
    const result = normaliseRow(rawRow({ email: null, award_classification: null }), COMPANY_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.email).toBeNull();
      expect(result.row.award_classification).toBeNull();
    }
  });
});

describe('normaliseRow — required-field errors', () => {
  it('flags missing first_name', () => {
    const result = normaliseRow(rawRow({ first_name: '' }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'first_name')).toBe(true);
    }
  });

  it('flags missing last_name', () => {
    const result = normaliseRow(rawRow({ last_name: null }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'last_name')).toBe(true);
    }
  });

  it('flags missing phone', () => {
    const result = normaliseRow(rawRow({ phone: '' }), COMPANY_ID);
    expect(result.ok).toBe(false);
  });

  it('flags missing employee_id', () => {
    const result = normaliseRow(rawRow({ employee_id: '' }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'employee_id')).toBe(true);
    }
  });

  it('flags missing pay_rate', () => {
    const result = normaliseRow(rawRow({ pay_rate: null }), COMPANY_ID);
    expect(result.ok).toBe(false);
  });
});

describe('normaliseRow — value-format errors', () => {
  it('flags an invalid phone (landline)', () => {
    const result = normaliseRow(rawRow({ phone: '0289123456' }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const phoneErr = result.errors.find((e) => e.field === 'phone');
      expect(phoneErr).toBeDefined();
      expect(phoneErr?.raw_value).toBe('0289123456');
    }
  });

  it('flags an invalid email', () => {
    const result = normaliseRow(rawRow({ email: 'not-an-email' }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'email')).toBe(true);
    }
  });

  it('flags pay_rate with too many decimal places', () => {
    const result = normaliseRow(rawRow({ pay_rate: '28.4760' }), COMPANY_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'pay_rate')).toBe(true);
    }
  });

  it('flags negative pay_rate', () => {
    const result = normaliseRow(rawRow({ pay_rate: '-10.00' }), COMPANY_ID);
    expect(result.ok).toBe(false);
  });

  it('collects multiple errors per row', () => {
    const result = normaliseRow(
      rawRow({ first_name: '', phone: 'x', pay_rate: 'y' }),
      COMPANY_ID,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('parsePayRate', () => {
  it.each([
    ['28', '28.00'],
    ['28.4', '28.40'],
    ['28.47', '28.47'],
    ['$28.47', '28.47'],
    [' 28.47 ', '28.47'],
    ['1,000.50', '1000.50'],
    ['0', '0.00'],
  ])('parses %s → %s', (input, expected) => {
    expect(parsePayRate(input)).toBe(expected);
  });

  it.each([['28.4760'], ['-1.00'], ['abc'], [''], ['28.4.7'], ['28e2']])(
    'rejects %s',
    (input) => {
      expect(parsePayRate(input)).toBeNull();
    },
  );
});
