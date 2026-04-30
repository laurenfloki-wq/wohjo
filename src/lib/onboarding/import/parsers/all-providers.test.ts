// Per-provider end-to-end parse test.
//
// Each test feeds a synthetic provider-format CSV into its parser and
// asserts the canonical WorkerImportRow output. The same logical row
// is reused across providers so we can confirm format-agnostic
// parity at the canonical layer.

import { describe, it, expect } from 'vitest';
import { parseXeroCsv } from './xero';
import { parseMyobCsv } from './myob';
import { parseEmploymentHeroCsv } from './employment-hero';
import { parseKeypayCsv } from './keypay';
import { parseMicropayCsv } from './micropay';
import { parseProviderCsv } from '../index';

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';

const EXPECTED_JOAO = {
  company_id: COMPANY_ID,
  first_name: 'Joao',
  last_name: 'Muniz',
  phone: '+61413573579',
  email: 'joao@example.test',
  employee_id: 'EMP-001',
  pay_rate: '28.47',
  award_classification: 'CW3',
};

describe('Xero CSV parser', () => {
  it('parses canonical Xero export to WorkerImportRow', () => {
    const csv =
      'First Name,Last Name,Mobile Number,Email,Employee Number,Pay Rate (Hourly),Award Classification\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47,CW3';
    const { rows, errors } = parseXeroCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(EXPECTED_JOAO);
    expect(rows[0].source_row).toBe(2);
  });

  it('accepts header alias variants', () => {
    const csv =
      'FirstName,Surname,Mobile,Email Address,Payroll Number,Hourly Rate\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47';
    const { rows, errors } = parseXeroCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe('MYOB CSV parser', () => {
  it('parses canonical MYOB export to WorkerImportRow', () => {
    const csv =
      'First Name,Surname,Phone Number,Email,Card ID,Pay Rate,Award Code\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47,CW3';
    const { rows, errors } = parseMyobCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject(EXPECTED_JOAO);
  });
});

describe('Employment Hero CSV parser', () => {
  it('parses canonical Employment Hero export to WorkerImportRow', () => {
    const csv =
      'Employee First Name,Employee Last Name,Mobile Phone,Email Address,Employee ID,Hourly Rate,Award Classification\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47,CW3';
    const { rows, errors } = parseEmploymentHeroCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject(EXPECTED_JOAO);
  });
});

describe('KeyPay CSV parser', () => {
  it('parses canonical KeyPay export to WorkerImportRow', () => {
    const csv =
      'FirstName,Surname,MobileNumber,EmailAddress,ExternalId,HourlyRate,Award\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47,CW3';
    const { rows, errors } = parseKeypayCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject(EXPECTED_JOAO);
  });
});

describe('Micropay CSV parser', () => {
  it('parses canonical Micropay export to WorkerImportRow', () => {
    const csv =
      'FirstName,LastName,Mobile,Email,EmployeeCode,BaseRate,AwardCode\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47,CW3';
    const { rows, errors } = parseMicropayCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject(EXPECTED_JOAO);
  });
});

describe('parseProviderCsv — provider dispatch', () => {
  it.each([
    ['xero' as const, 'First Name,Last Name,Mobile Number,Email,Employee Number,Pay Rate (Hourly)\nJoao,Muniz,0413573579,joao@example.test,EMP-001,28.47'],
    ['myob' as const, 'First Name,Surname,Phone Number,Email,Card ID,Pay Rate\nJoao,Muniz,0413573579,joao@example.test,EMP-001,28.47'],
    ['employment-hero' as const, 'Employee First Name,Employee Last Name,Mobile Phone,Email Address,Employee ID,Hourly Rate\nJoao,Muniz,0413573579,joao@example.test,EMP-001,28.47'],
    ['keypay' as const, 'FirstName,Surname,MobileNumber,EmailAddress,ExternalId,HourlyRate\nJoao,Muniz,0413573579,joao@example.test,EMP-001,28.47'],
    ['micropay' as const, 'FirstName,LastName,Mobile,Email,EmployeeCode,BaseRate\nJoao,Muniz,0413573579,joao@example.test,EMP-001,28.47'],
  ])('dispatches to %s parser', (provider, csv) => {
    const { rows, errors } = parseProviderCsv(provider, csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].first_name).toBe('Joao');
    expect(rows[0].phone).toBe('+61413573579');
  });

  it('rejects an unknown provider at the type-checked default branch', () => {
    expect(() =>
      parseProviderCsv(
        // @ts-expect-error — testing exhaustiveness guard
        'unknown',
        '',
        COMPANY_ID,
      ),
    ).toThrow(/unknown provider/);
  });
});

describe('CSV-level error surfacing', () => {
  it('surfaces a per-row error for a malformed row in Xero', () => {
    const csv =
      'First Name,Last Name,Mobile Number,Email,Employee Number,Pay Rate (Hourly)\n' +
      'Joao,Muniz,not-a-phone,joao@example.test,EMP-001,28.47';
    const { rows, errors } = parseXeroCsv(csv, COMPANY_ID);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => e.field === 'phone')).toBe(true);
  });

  it('skips trailing blank rows without producing errors', () => {
    const csv =
      'First Name,Last Name,Mobile Number,Email,Employee Number,Pay Rate (Hourly)\n' +
      'Joao,Muniz,0413573579,joao@example.test,EMP-001,28.47\n\n\n';
    const { rows, errors } = parseXeroCsv(csv, COMPANY_ID);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('surfaces an empty-file error', () => {
    const { rows, errors } = parseXeroCsv('', COMPANY_ID);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/empty/);
  });

  it('surfaces a malformed-CSV (unterminated quote) error', () => {
    const { rows, errors } = parseXeroCsv('a,b\n"unterminated,1', COMPANY_ID);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unterminated/);
  });
});
