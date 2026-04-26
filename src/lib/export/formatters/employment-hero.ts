// ─── Architecture D — strategic intent (last reviewed 2026-04-25) ────
// This file is a TRANSITIONAL CSV format adapter for the bookkeeper-
// mediated workflow. It is NOT a payroll-system integration.
//
// FLOSTRUCTION's architectural endpoint is a public API substrate
// (Phase 2; target end of 2026 / H1 2027). Under that direction,
// payroll vendors integrate WITH FLOSTRUCTION via the public API.
// FLOSMOSIS does NOT build payroll-system-specific integrations.
//
// These formatters exist so that today's customer (Mo and the
// founding cohort) can hand a CSV to their bookkeeper while the
// public API matures. They retire as soon as payroll vendors ship
// their FLOSTRUCTION integrations.
//
// FUTURE ENGINEERS: do NOT extend these into payroll-system API
// integrations. If a customer asks for deeper integration, the
// answer is "we publish our records via the public API; your
// payroll provider can read them". File the customer request in
// the public API backlog instead of writing more code here.
//
// Reference: bulletproofing-sprint-readiness-report-2026-04-25.md
// ──────────────────────────────────────────────────────────────────────

// Flostruction Export — Employment Hero / KeyPay CSV Formatter
// Implements ExportFormatter for Employment Hero's timesheet import format.
// Reference: research/eh-csv-formatter-raw.ts (Genspark research scaffold)

import type { ApprovedShift, ExportFormatter, ValidationError } from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────

const EH_CSV_COLUMNS = [
  'Employee ID',
  'Employee Name',
  'Date',
  'Start Time',
  'Finish Time',
  'Break (mins)',
  'Ordinary Hours',
  'Notes',
] as const;

const LF = '\n';

// ─── CSV Helpers ────────────────────────────────────────────────────────────

/**
 * RFC 4180 CSV field escaping.
 * Wraps in double quotes if field contains comma, double quote, or newline.
 * Internal double quotes escaped as "".
 */
export function escapeCSVField(value: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);

  // Security: prevent CSV formula injection (OWASP recommendation)
  if (str.length > 0 && ['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    // Prefix with single quote to prevent Excel formula execution
    return `"'${str.replace(/"/g, '""')}"`;
  }

  const needsQuoting =
    str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r');
  if (!needsQuoting) {
    return str;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Format ISO date string to DD/MM/YYYY (Australian standard for EH).
 */
export function formatDateAU(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

/**
 * Format ISO timestamptz to HH:MM (24hr) in AEST (UTC+10).
 * // FLOSTRUCTION PARKING LOT: AEDT (UTC+11) handling for daylight saving — Phase 2
 */
export function formatTimeAEST(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

/**
 * Format decimal hours to exactly 2 decimal places.
 * Uses string manipulation to avoid floating point errors.
 * Non-negotiable: all monetary/hour values are decimal(10,2).
 */
export function formatDecimal2(value: number): string {
  return value.toFixed(2);
}

// ─── Row Formatter ──────────────────────────────────────────────────────────

function formatShiftRow(shift: ApprovedShift): string {
  const fields: string[] = [
    escapeCSVField(shift.worker_employee_id),
    escapeCSVField(`${shift.worker_first_name} ${shift.worker_last_name}`),
    escapeCSVField(formatDateAU(shift.shift_date)),
    escapeCSVField(formatTimeAEST(shift.start_time)),
    escapeCSVField(formatTimeAEST(shift.end_time)),
    escapeCSVField(String(shift.break_minutes)),
    escapeCSVField(formatDecimal2(shift.total_hours)),
    escapeCSVField(shift.notes ?? ''),
  ];
  // Trim trailing empty fields to avoid trailing comma on rows with empty notes
  while (fields.length > 0 && fields[fields.length - 1] === '') {
    fields.pop();
  }
  return fields.join(',');
}

// ─── Formatter Implementation ───────────────────────────────────────────────

export const EmploymentHeroFormatter: ExportFormatter = {
  providerId: 'employment_hero',
  providerName: 'Employment Hero',
  fileExtension: 'csv',
  mimeType: 'text/csv',

  validate(shifts: ApprovedShift[]): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const shift of shifts) {
      if (shift.status !== 'PAYROLL_APPROVED') {
        errors.push({
          shiftId: shift.id,
          field: 'status',
          message: `Shift status is "${shift.status}", expected "PAYROLL_APPROVED"`,
        });
      }

      if (!shift.worker_employee_id || shift.worker_employee_id.trim() === '') {
        errors.push({
          shiftId: shift.id,
          field: 'worker_employee_id',
          message: 'Missing Employment Hero Employee ID',
        });
      }

      if (!shift.shift_date || !/^\d{4}-\d{2}-\d{2}$/.test(shift.shift_date)) {
        errors.push({
          shiftId: shift.id,
          field: 'shift_date',
          message: `Invalid shift_date format: "${shift.shift_date}"`,
        });
      }

      if (!shift.start_time || isNaN(new Date(shift.start_time).getTime())) {
        errors.push({
          shiftId: shift.id,
          field: 'start_time',
          message: `Invalid start_time: "${shift.start_time}"`,
        });
      }

      if (!shift.end_time || isNaN(new Date(shift.end_time).getTime())) {
        errors.push({
          shiftId: shift.id,
          field: 'end_time',
          message: `Invalid end_time: "${shift.end_time}"`,
        });
      }

      if (shift.total_hours <= 0) {
        errors.push({
          shiftId: shift.id,
          field: 'total_hours',
          message: `total_hours must be positive, got ${shift.total_hours}`,
        });
      }

      if (shift.break_minutes < 0) {
        errors.push({
          shiftId: shift.id,
          field: 'break_minutes',
          message: `break_minutes must be non-negative, got ${shift.break_minutes}`,
        });
      }
    }

    return errors;
  },

  format(shifts: ApprovedShift[]): string {
    const header = EH_CSV_COLUMNS.join(',');
    const rows: string[] = [header];

    for (const shift of shifts) {
      rows.push(formatShiftRow(shift));
    }

    // LF line endings (not CRLF), no trailing newline
    return rows.join(LF);
  },
};
