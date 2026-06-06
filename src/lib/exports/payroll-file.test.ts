// M4-G — payroll-file lib tests.

import { describe, it, expect } from 'vitest';
import {
  buildMyobXlsx, buildRfc4180Csv, TenantActivityMappingMissing,
  MYOB_XLSX_MIME, CSV_MIME, type PayrollFileRow,
} from './payroll-file';
import * as XLSX from 'xlsx';

function baseRow(overrides: Partial<PayrollFileRow> = {}): PayrollFileRow {
  return {
    employee_id: 'EMP-001',
    full_name: 'Joao Muniz Campos',
    myob_card_id: '*0001',
    shift_date: '2026-06-02',
    total_hours: 8.0,
    category: 'ordinary_hours',
    receipt_id: 'FSTR-AAAAAAAA',
    ...overrides,
  };
}

function fullMappings() {
  return new Map<string, string>([
    ['ordinary_hours', 'ACT-OH'],
    ['overtime_1_5x', 'ACT-OT15'],
  ]);
}

describe('buildMyobXlsx', () => {
  it('emits a valid .xlsx workbook with one Timesheet sheet', () => {
    const out = buildMyobXlsx({
      rows: [baseRow()],
      mappings: fullMappings(),
      company_name: 'Test Co',
      pay_period_start: '2026-06-01',
      pay_period_end: '2026-06-07',
    });
    expect(out).toBeInstanceOf(Buffer);
    expect(out.length).toBeGreaterThan(0);
    const wb = XLSX.read(out, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Timesheet');
    const ws = wb.Sheets['Timesheet'];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(aoa[0]).toEqual(['Card ID', 'Employee Name', 'Date Worked', 'Activity ID', 'Hours', 'Notes']);
    expect(aoa[1]).toEqual(['*0001', 'Joao Muniz Campos', '2026-06-02', 'ACT-OH', 8, 'FSTR-AAAAAAAA']);
  });

  it('throws TenantActivityMappingMissing when a category lacks a mapping', () => {
    expect(() =>
      buildMyobXlsx({
        rows: [baseRow({ category: 'travel_allowance' })],
        mappings: fullMappings(),
        company_name: 'Test Co',
        pay_period_start: '2026-06-01',
        pay_period_end: '2026-06-07',
      }),
    ).toThrow(TenantActivityMappingMissing);
  });

  it('skips workers without a myob_card_id', () => {
    const out = buildMyobXlsx({
      rows: [
        baseRow({ employee_id: 'A', myob_card_id: null }),
        baseRow({ employee_id: 'B', myob_card_id: '*0002', full_name: 'Worker B' }),
      ],
      mappings: fullMappings(),
      company_name: 'Test Co',
      pay_period_start: '2026-06-01',
      pay_period_end: '2026-06-07',
    });
    const wb = XLSX.read(out, { type: 'buffer' });
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Timesheet'], { header: 1 });
    expect(aoa.length).toBe(2);  // header + 1 row (the carded worker)
    expect((aoa[1] as unknown[])[0]).toBe('*0002');
  });
});

describe('buildRfc4180Csv', () => {
  it('starts with UTF-8 BOM bytes 0xEF 0xBB 0xBF', () => {
    const out = buildRfc4180Csv({ rows: [baseRow()], mappings: fullMappings() });
    expect(out[0]).toBe(0xEF);
    expect(out[1]).toBe(0xBB);
    expect(out[2]).toBe(0xBF);
  });

  it('uses CRLF line endings + trailing CRLF', () => {
    const out = buildRfc4180Csv({ rows: [baseRow()], mappings: fullMappings() });
    const text = out.slice(3).toString('utf8');
    const lines = text.split('\r\n');
    // header + 1 row + trailing empty (from final CRLF)
    expect(lines.length).toBe(3);
    expect(lines[2]).toBe('');
  });

  it('quotes fields containing commas, newlines, or quotes and doubles internal quotes', () => {
    const out = buildRfc4180Csv({
      rows: [baseRow({ full_name: 'Smith, "Joe"' })],
      mappings: fullMappings(),
    });
    const text = out.slice(3).toString('utf8');
    expect(text).toContain('"Smith, ""Joe"""');
  });

  it('throws TenantActivityMappingMissing for unmapped categories', () => {
    expect(() =>
      buildRfc4180Csv({
        rows: [baseRow({ category: 'travel_allowance' })],
        mappings: fullMappings(),
      }),
    ).toThrow(TenantActivityMappingMissing);
  });
});

describe('MIME constants', () => {
  it('matches the IETF xlsx + RFC 7111 csv tokens', () => {
    expect(MYOB_XLSX_MIME).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(CSV_MIME).toBe('text/csv; charset=utf-8');
  });
});
