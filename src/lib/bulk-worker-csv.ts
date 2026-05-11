// CRACK 232 — bulk worker CSV parser, shared between the admin route
// (server) and the bulk-upload page (client). Pure functions, no
// runtime imports — safe to bundle into both contexts.

const CSV_HEADER = 'employee_id,full_name,mobile_e164,myob_card_id';
const AU_MOBILE_RE = /^\+61[0-9]{9}$/;

export interface ParsedWorker {
  /** 1-based row index (header is row 1). */
  row_index: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  myob_card_id: string | null;
}

export interface RowError {
  row: number;
  error: string;
}

export interface ParseResult {
  rows: ParsedWorker[];
  errors: RowError[];
}

/**
 * Split a full_name into first_name + last_name on the FIRST space.
 * Single-token names become first_name="X", last_name="-" so the
 * workers.last_name NOT NULL constraint is satisfied without
 * inventing data.
 */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  const firstSpace = trimmed.indexOf(' ');
  if (firstSpace === -1) {
    return { first_name: trimmed, last_name: '-' };
  }
  return {
    first_name: trimmed.slice(0, firstSpace).trim(),
    last_name: trimmed.slice(firstSpace + 1).trim() || '-',
  };
}

export { CSV_HEADER as BULK_WORKER_CSV_HEADER };

/**
 * Parse a CRACK 232 bulk-upload CSV. Header MUST match
 * `employee_id,full_name,mobile_e164,myob_card_id` verbatim.
 * Returns parsed rows + per-row errors. Rows with errors are NOT
 * included in `rows`. Caller decides whether to surface to user
 * (e.g. atomic upload: any error → reject entire CSV).
 */
export function parseBulkWorkerCsv(csv: string): ParseResult {
  const rows: ParsedWorker[] = [];
  const errors: RowError[] = [];

  const text = csv.replace(/^﻿/, ''); // strip BOM if present
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim().length === 0) {
    return { rows, errors: [{ row: 0, error: 'CSV is empty.' }] };
  }

  const header = lines[0].trim();
  if (header !== CSV_HEADER) {
    return {
      rows,
      errors: [{ row: 1, error: `Header mismatch. Expected: "${CSV_HEADER}". Got: "${header}".` }],
    };
  }

  const seenEmployeeIds = new Map<string, number>();
  const seenPhones = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim().length === 0) continue;
    const rowNum = i + 1;

    const cols = raw.split(',');
    if (cols.length < 3 || cols.length > 4) {
      errors.push({
        row: rowNum,
        error: `Expected 3-4 comma-separated columns, got ${cols.length}.`,
      });
      continue;
    }

    const employee_id = (cols[0] ?? '').trim();
    const full_name = (cols[1] ?? '').trim();
    const mobile_e164 = (cols[2] ?? '').trim();
    const myob_card_raw = ((cols[3] ?? '') as string).trim();

    if (!employee_id) {
      errors.push({ row: rowNum, error: 'employee_id is required.' });
      continue;
    }
    if (!full_name) {
      errors.push({ row: rowNum, error: 'full_name is required.' });
      continue;
    }
    if (!AU_MOBILE_RE.test(mobile_e164)) {
      errors.push({
        row: rowNum,
        error: `mobile_e164 "${mobile_e164}" must match +61XXXXXXXXX (E.164 AU mobile).`,
      });
      continue;
    }

    if (seenEmployeeIds.has(employee_id)) {
      errors.push({
        row: rowNum,
        error: `Duplicate employee_id "${employee_id}" (also on row ${seenEmployeeIds.get(employee_id)}).`,
      });
      continue;
    }
    if (seenPhones.has(mobile_e164)) {
      errors.push({
        row: rowNum,
        error: `Duplicate mobile_e164 "${mobile_e164}" (also on row ${seenPhones.get(mobile_e164)}).`,
      });
      continue;
    }
    seenEmployeeIds.set(employee_id, rowNum);
    seenPhones.set(mobile_e164, rowNum);

    const { first_name, last_name } = splitFullName(full_name);
    rows.push({
      row_index: rowNum,
      employee_id,
      first_name,
      last_name,
      phone: mobile_e164,
      myob_card_id: myob_card_raw || null,
    });
  }

  return { rows, errors };
}
