// Flostruction Export — Employment Hero Formatter Tests
// Adapted from research/eh-csv-formatter.test-raw.ts
// The Joao scenario runs first — it's the test that never changes.

import { describe, it, expect } from 'vitest';
import {
  EmploymentHeroFormatter,
  escapeCSVField,
  formatDateAU,
  formatTimeAEST,
  formatDecimal2,
} from './employment-hero';
import type { ApprovedShift } from '../types';

// ─── Test Fixture Builder ───────────────────────────────────────────────────

function makeShift(overrides: Partial<ApprovedShift> = {}): ApprovedShift {
  return {
    id: 'a3f9b2c1-0000-4000-a000-000000000001',
    worker_id: '20000000-0000-4000-a000-000000000001',
    worker_employee_id: 'EH-001',
    worker_first_name: 'Joao',
    worker_last_name: 'Ferreira',
    site_id: '10000000-0000-4000-a000-000000000001',
    site_name: 'Gungahlin Site',
    company_id: '00000000-0000-4000-a000-000000000001',
    shift_date: '2025-04-07',
    start_time: '2025-04-06T21:00:00.000Z',  // 7:00am AEST
    end_time: '2025-04-07T05:30:00.000Z',    // 3:30pm AEST
    break_minutes: 30,
    total_hours: 8.0,
    pay_rate: 28.47,
    status: 'PAYROLL_APPROVED',
    receipt_id: 'FSTR-ABC12345',
    notes: '',
    ...overrides,
  };
}

// ─── RFC 4180 CSV Row Parser (test helper only) ────────────────────────────

function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < row.length) {
    const char = row[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') { inQuotes = true; i++; continue; }
      if (char === ',') { fields.push(current); current = ''; i++; continue; }
      current += char;
      i++;
    }
  }
  fields.push(current);
  return fields;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TEST THAT NEVER CHANGES — Joao scenario
// ═══════════════════════════════════════════════════════════════════════════

describe('Joao scenario — 8hrs, 7am–3:30pm, 30min break, $28.47/hr', () => {
  const joaoShift = makeShift();

  it('produces correct CSV header + data row', () => {
    const csv = EmploymentHeroFormatter.format([joaoShift]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Employee ID,Employee Name,Date,Start Time,Finish Time,Break (mins),Ordinary Hours,Notes'
    );
    expect(lines[1]).toBe('EH-001,Joao Ferreira,07/04/2025,07:00,15:30,30,8.00');
  });

  it('has exactly 2 lines (header + 1 row)', () => {
    const csv = EmploymentHeroFormatter.format([joaoShift]);
    expect(csv.split('\n').length).toBe(2);
  });

  it('uses LF line endings, not CRLF', () => {
    const csv = EmploymentHeroFormatter.format([joaoShift]);
    expect(csv).not.toContain('\r\n');
    expect(csv).toContain('\n');
  });

  it('has no trailing comma on any line', () => {
    const csv = EmploymentHeroFormatter.format([joaoShift]);
    for (const line of csv.split('\n')) {
      expect(line.endsWith(',')).toBe(false);
    }
  });

  it('has no trailing newline', () => {
    const csv = EmploymentHeroFormatter.format([joaoShift]);
    expect(csv.endsWith('\n')).toBe(false);
  });

  it('validates Joao shift with zero errors', () => {
    const errors = EmploymentHeroFormatter.validate([joaoShift]);
    expect(errors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Overnight shift
// ═══════════════════════════════════════════════════════════════════════════

describe('Overnight shift', () => {
  const overnightShift = makeShift({
    id: 'b2e8f3a4-0000-4000-a000-000000000002',
    worker_employee_id: 'EH-006',
    worker_first_name: 'Liam',
    worker_last_name: 'Murphy',
    shift_date: '2025-04-08',
    start_time: '2025-04-08T12:00:00.000Z',  // 10pm AEST
    end_time: '2025-04-08T20:00:00.000Z',    // 6am AEST next day
    break_minutes: 30,
    total_hours: 7.5,
    notes: 'Night shift',
  });

  it('formats overnight shift with correct times', () => {
    const csv = EmploymentHeroFormatter.format([overnightShift]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('EH-006,Liam Murphy,08/04/2025,22:00,06:00,30,7.50,Night shift');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Name with apostrophe (O'Brien)
// ═══════════════════════════════════════════════════════════════════════════

describe("Worker name with apostrophe — O'Brien", () => {
  it("includes O'Brien without quoting", () => {
    const shift = makeShift({
      worker_employee_id: 'EH-003',
      worker_first_name: 'Maria',
      worker_last_name: "O'Brien",
    });
    const csv = EmploymentHeroFormatter.format([shift]);
    expect(csv).toContain("Maria O'Brien");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Name with comma (triggers RFC 4180 quoting)
// ═══════════════════════════════════════════════════════════════════════════

describe('Worker name with comma', () => {
  const commaShift = makeShift({
    worker_employee_id: 'EH-099',
    worker_first_name: 'John',
    worker_last_name: 'Smith, Jr.',
  });

  it('wraps name in double quotes', () => {
    const csv = EmploymentHeroFormatter.format([commaShift]);
    expect(csv).toContain('"John Smith, Jr."');
  });

  it('parses back correctly with name intact', () => {
    const csv = EmploymentHeroFormatter.format([commaShift]);
    const fields = parseCSVRow(csv.split('\n')[1]);
    // 7 fields when notes is empty (trailing empty field trimmed)
    expect(fields.length).toBe(7);
    expect(fields[1]).toBe('John Smith, Jr.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Notes with double quotes
// ═══════════════════════════════════════════════════════════════════════════

describe('Notes with double quotes', () => {
  it('escapes double quotes as ""', () => {
    const shift = makeShift({ notes: 'He said "confirmed" for Monday' });
    const csv = EmploymentHeroFormatter.format([shift]);
    expect(csv).toContain('"He said ""confirmed"" for Monday"');
  });

  it('round-trips through parser', () => {
    const shift = makeShift({ notes: 'He said "confirmed" for Monday' });
    const csv = EmploymentHeroFormatter.format([shift]);
    const fields = parseCSVRow(csv.split('\n')[1]);
    expect(fields[7]).toBe('He said "confirmed" for Monday');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Empty / undefined notes
// ═══════════════════════════════════════════════════════════════════════════

describe('Empty notes', () => {
  it('renders empty string, no trailing comma', () => {
    const csv = EmploymentHeroFormatter.format([makeShift({ notes: '' })]);
    const line = csv.split('\n')[1];
    expect(line.endsWith(',')).toBe(false);
  });

  it('handles undefined notes gracefully', () => {
    const csv = EmploymentHeroFormatter.format([
      makeShift({ notes: undefined as unknown as string }),
    ]);
    expect(csv.split('\n').length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 300-shift batch
// ═══════════════════════════════════════════════════════════════════════════

describe('300-shift batch', () => {
  const batch = Array.from({ length: 300 }, (_, i) =>
    makeShift({
      id: `batch-${String(i).padStart(4, '0')}-0000-4000-a000-000000000000`,
      worker_employee_id: `EH-${String(i + 1).padStart(3, '0')}`,
      worker_first_name: 'Worker',
      worker_last_name: String(i + 1),
    })
  );

  it('produces 301 lines (1 header + 300 rows)', () => {
    const csv = EmploymentHeroFormatter.format(batch);
    expect(csv.split('\n').length).toBe(301);
  });

  it('every row has 7 fields (empty notes trimmed)', () => {
    const csv = EmploymentHeroFormatter.format(batch);
    const lines = csv.split('\n');
    for (let i = 1; i < lines.length; i++) {
      // 7 fields because trailing empty notes field is trimmed
      expect(parseCSVRow(lines[i]).length).toBe(7);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Decimal precision
// ═══════════════════════════════════════════════════════════════════════════

describe('Decimal precision', () => {
  it('formatDecimal2 preserves 2 decimal places', () => {
    expect(formatDecimal2(8.0)).toBe('8.00');
    expect(formatDecimal2(7.5)).toBe('7.50');
    expect(formatDecimal2(9.25)).toBe('9.25');
    expect(formatDecimal2(10.0)).toBe('10.00');
    expect(formatDecimal2(0.5)).toBe('0.50');
  });

  it('does not produce floating point artifacts for 8.5', () => {
    const csv = EmploymentHeroFormatter.format([makeShift({ total_hours: 8.5 })]);
    expect(csv).toContain('8.50');
    expect(csv).not.toContain('8.4999');
    expect(csv).not.toContain('8.5001');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// escapeCSVField unit tests
// ═══════════════════════════════════════════════════════════════════════════

describe('escapeCSVField', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCSVField('hello')).toBe('hello');
  });

  it('wraps comma string in quotes', () => {
    expect(escapeCSVField('Smith, Jr.')).toBe('"Smith, Jr."');
  });

  it('escapes internal double quotes', () => {
    expect(escapeCSVField('He said "yes"')).toBe('"He said ""yes"""');
  });

  it('wraps newline string in quotes', () => {
    expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"');
  });

  it("leaves apostrophe unquoted", () => {
    expect(escapeCSVField("O'Brien")).toBe("O'Brien");
  });

  it('returns empty for empty input', () => {
    expect(escapeCSVField('')).toBe('');
  });

  it('returns empty for null/undefined', () => {
    expect(escapeCSVField(null as unknown as string)).toBe('');
    expect(escapeCSVField(undefined as unknown as string)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatDateAU
// ═══════════════════════════════════════════════════════════════════════════

describe('formatDateAU', () => {
  it('formats 2025-04-07 as 07/04/2025', () => {
    expect(formatDateAU('2025-04-07')).toBe('07/04/2025');
  });

  it('formats 2025-01-01 as 01/01/2025', () => {
    expect(formatDateAU('2025-01-01')).toBe('01/01/2025');
  });

  it('formats 2025-12-31 as 31/12/2025', () => {
    expect(formatDateAU('2025-12-31')).toBe('31/12/2025');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatTimeAEST
// ═══════════════════════════════════════════════════════════════════════════

describe('formatTimeAEST', () => {
  it('converts UTC 21:00 to AEST 07:00', () => {
    expect(formatTimeAEST('2025-04-06T21:00:00.000Z')).toBe('07:00');
  });

  it('converts UTC 05:30 to AEST 15:30', () => {
    expect(formatTimeAEST('2025-04-07T05:30:00.000Z')).toBe('15:30');
  });

  it('converts UTC 12:00 to AEST 22:00', () => {
    expect(formatTimeAEST('2025-04-08T12:00:00.000Z')).toBe('22:00');
  });

  it('converts UTC 20:00 to AEST 06:00', () => {
    expect(formatTimeAEST('2025-04-08T20:00:00.000Z')).toBe('06:00');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateForExport
// ═══════════════════════════════════════════════════════════════════════════

describe('validate', () => {
  it('returns empty array for valid shift', () => {
    expect(EmploymentHeroFormatter.validate([makeShift()])).toEqual([]);
  });

  it('flags non-PAYROLL_APPROVED status', () => {
    const shift = makeShift({ status: 'SUBMITTED' as unknown as 'PAYROLL_APPROVED' });
    const errors = EmploymentHeroFormatter.validate([shift]);
    expect(errors.some((e) => e.field === 'status')).toBe(true);
  });

  it('flags missing employee ID', () => {
    const errors = EmploymentHeroFormatter.validate([makeShift({ worker_employee_id: '' })]);
    expect(errors.some((e) => e.field === 'worker_employee_id')).toBe(true);
  });

  it('flags negative break_minutes', () => {
    const errors = EmploymentHeroFormatter.validate([makeShift({ break_minutes: -10 })]);
    expect(errors.some((e) => e.field === 'break_minutes')).toBe(true);
  });

  it('flags zero total_hours', () => {
    const errors = EmploymentHeroFormatter.validate([makeShift({ total_hours: 0 })]);
    expect(errors.some((e) => e.field === 'total_hours')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Formatter metadata
// ═══════════════════════════════════════════════════════════════════════════

describe('EmploymentHeroFormatter metadata', () => {
  it('has correct providerId', () => {
    expect(EmploymentHeroFormatter.providerId).toBe('employment_hero');
  });

  it('has correct providerName', () => {
    expect(EmploymentHeroFormatter.providerName).toBe('Employment Hero');
  });

  it('exports as CSV', () => {
    expect(EmploymentHeroFormatter.fileExtension).toBe('csv');
    expect(EmploymentHeroFormatter.mimeType).toBe('text/csv');
  });
});
