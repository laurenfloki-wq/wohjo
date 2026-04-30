// Shared row-normalisation primitives for provider parsers.
//
// Each provider parser produces a raw {first_name, last_name, phone,
// email, employee_id, pay_rate, award_classification} dict from its
// CSV columns and then runs it through normaliseRow() to produce a
// clean WorkerImportRow or a per-row WorkerImportError.

import { toCanonical } from '../../../utils/phoneNormaliser';
import type { WorkerImportError, WorkerImportRow } from '../types';

export interface RawRow {
  source_row: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  employee_id: string | null;
  pay_rate: string | null;
  award_classification: string | null;
}

/**
 * Normalise a raw provider-parsed row into a canonical WorkerImportRow.
 *
 * Returns either the clean row or a list of per-field errors. Multiple
 * field errors in the same row collapse into one returned error array
 * so the caller can show all problems for a row in one pass.
 *
 * Required fields: first_name, last_name, phone, employee_id, pay_rate.
 * Optional: email, award_classification (null when absent).
 *
 * Validation rules:
 *   - phone runs through phoneNormaliser.toCanonical(); the canonical
 *     +61XXXXXXXXX result is stored. Any phoneNormaliser throw is
 *     captured as a phone-field error.
 *   - email must look like an email (contains @ and a dot in the
 *     domain part) when present; null when absent.
 *   - pay_rate must parse to a non-negative finite number with at
 *     most 2 decimal places; stored as decimal-formatted string.
 *   - first_name, last_name, employee_id: must be non-empty after
 *     trim.
 */
export function normaliseRow(
  raw: RawRow,
  company_id: string,
):
  | { ok: true; row: WorkerImportRow }
  | { ok: false; errors: WorkerImportError[] } {
  const errors: WorkerImportError[] = [];

  const first_name = nonEmpty(raw.first_name);
  if (!first_name) {
    errors.push({
      source_row: raw.source_row,
      field: 'first_name',
      message: 'first name is required',
    });
  }

  const last_name = nonEmpty(raw.last_name);
  if (!last_name) {
    errors.push({
      source_row: raw.source_row,
      field: 'last_name',
      message: 'last name is required',
    });
  }

  const employee_id = nonEmpty(raw.employee_id);
  if (!employee_id) {
    errors.push({
      source_row: raw.source_row,
      field: 'employee_id',
      message: 'employee id is required (Employment Hero export needs this)',
    });
  }

  let phone = '';
  if (!raw.phone || raw.phone.trim().length === 0) {
    errors.push({
      source_row: raw.source_row,
      field: 'phone',
      message: 'phone is required',
    });
  } else {
    try {
      phone = toCanonical(raw.phone);
    } catch (err) {
      errors.push({
        source_row: raw.source_row,
        field: 'phone',
        message: err instanceof Error ? err.message : 'invalid phone',
        raw_value: raw.phone,
      });
    }
  }

  let pay_rate = '';
  if (!raw.pay_rate || raw.pay_rate.trim().length === 0) {
    errors.push({
      source_row: raw.source_row,
      field: 'pay_rate',
      message: 'pay rate is required',
    });
  } else {
    const parsed = parsePayRate(raw.pay_rate);
    if (parsed === null) {
      errors.push({
        source_row: raw.source_row,
        field: 'pay_rate',
        message: 'pay rate must be a non-negative number with at most 2 decimal places',
        raw_value: raw.pay_rate,
      });
    } else {
      pay_rate = parsed;
    }
  }

  let email: string | null = null;
  if (raw.email && raw.email.trim().length > 0) {
    const trimmed = raw.email.trim();
    if (!isEmailLike(trimmed)) {
      errors.push({
        source_row: raw.source_row,
        field: 'email',
        message: 'email format is invalid',
        raw_value: raw.email,
      });
    } else {
      email = trimmed;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    row: {
      company_id,
      source_row: raw.source_row,
      first_name: first_name!,
      last_name: last_name!,
      phone,
      email,
      employee_id: employee_id!,
      pay_rate,
      award_classification: nonEmpty(raw.award_classification) ?? null,
    },
  };
}

function nonEmpty(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function isEmailLike(s: string): boolean {
  // Deliberately permissive — providers vary on what they accept;
  // application-layer validation is at the form, not the import.
  if (s.length > 254) return false;
  const at = s.indexOf('@');
  if (at < 1) return false;
  const domain = s.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/**
 * Parse a pay-rate string from any of the formats providers emit:
 *   "28.47", "28", "28.50", "$28.47", " 28.47 ", "28.4760"
 * Returns canonical decimal string with exactly 2 decimal places, or
 * null if invalid. Negative values are rejected. More than 2 decimal
 * places is rejected — providers should not emit sub-cent rates and
 * silent truncation hides bugs.
 */
export function parsePayRate(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const dotIdx = trimmed.indexOf('.');
  if (dotIdx >= 0) {
    const decimals = trimmed.length - dotIdx - 1;
    if (decimals > 2) return null;
  }
  const num = Number.parseFloat(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return num.toFixed(2);
}
