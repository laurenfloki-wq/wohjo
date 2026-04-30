// Xero Payroll employee CSV parser.
//
// Xero's Payroll module exports an employee list with the following
// commonly-seen header columns (Xero exports vary across product
// generations; this parser accepts the union of well-known aliases):
//
//   First Name | Last Name | Mobile Number | Email | Employee Number
//   Pay Rate (Hourly) | Award Classification
//
// We accept these header aliases. Columns we don't recognise are
// ignored (Xero exports often include 50+ columns; we only need 5
// required + 2 optional).
//
// Substrate-DD note: Xero historically exported Mobile Number with
// AU national format ("0413573579") and a leading-zero-stripped
// "Employee Number" that may include leading zeros if quoted. The
// phoneNormaliser handles both. The CSV parser preserves quoted leading
// zeros in employee_id.

import { parseCsv, headerIndex, pick } from '../csv';
import { normaliseRow } from './base';
import type { ParseResult, WorkerImportRow, WorkerImportError } from '../types';

const ALIASES = {
  first_name: ['First Name', 'FirstName', 'Given Name', 'First Names'],
  last_name: ['Last Name', 'LastName', 'Surname', 'Family Name'],
  phone: ['Mobile Number', 'Mobile', 'Phone', 'Mobile Phone'],
  email: ['Email', 'Email Address', 'Personal Email'],
  employee_id: ['Employee Number', 'Employee Id', 'Employee ID', 'Payroll Number'],
  pay_rate: [
    'Pay Rate (Hourly)',
    'Hourly Rate',
    'Rate',
    'Pay Rate',
    'Standard Hourly Rate',
  ],
  award_classification: ['Award Classification', 'Classification', 'Award Level'],
};

export function parseXeroCsv(input: string, company_id: string): ParseResult {
  const rows: WorkerImportRow[] = [];
  const errors: WorkerImportError[] = [];

  let parsed: string[][];
  try {
    parsed = parseCsv(input);
  } catch (err) {
    errors.push({
      source_row: 1,
      field: 'row',
      message: err instanceof Error ? err.message : 'CSV parse failed',
    });
    return { rows, errors };
  }

  if (parsed.length === 0) {
    errors.push({
      source_row: 1,
      field: 'row',
      message: 'empty file',
    });
    return { rows, errors };
  }

  const headers = headerIndex(parsed[0]);

  for (let r = 1; r < parsed.length; r++) {
    const dataRow = parsed[r];
    // Skip fully-empty rows (trailing newline producing empty arrays)
    if (dataRow.every((c) => c.trim().length === 0)) continue;

    const result = normaliseRow(
      {
        source_row: r + 1, // 1-based, header at row 1
        first_name: pick(dataRow, headers, ALIASES.first_name),
        last_name: pick(dataRow, headers, ALIASES.last_name),
        phone: pick(dataRow, headers, ALIASES.phone),
        email: pick(dataRow, headers, ALIASES.email),
        employee_id: pick(dataRow, headers, ALIASES.employee_id),
        pay_rate: pick(dataRow, headers, ALIASES.pay_rate),
        award_classification: pick(dataRow, headers, ALIASES.award_classification),
      },
      company_id,
    );

    if (result.ok) rows.push(result.row);
    else errors.push(...result.errors);
  }

  return { rows, errors };
}
