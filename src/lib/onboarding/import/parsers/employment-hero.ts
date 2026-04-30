// Employment Hero employee CSV parser.
//
// Employment Hero employee exports include:
//   Employee First Name | Employee Last Name | Mobile Phone | Email Address
//   Employee ID | Hourly Rate | Award Classification
//
// Employment Hero is the integration target for FLOSTRUCTION's payroll
// CSV export, so this parser is the most thoroughly aligned with our
// downstream substrate. Per CLAUDE.md non-negotiable #7:
// "Employment Hero CSV format is exact. Do not improvise columns."
//
// IMPORTANT: this parser is the IMPORT pathway (provider -> FLOSTRUCTION).
// The EXPORT pathway (FLOSTRUCTION -> Employment Hero) lives in
// src/lib/export/ and uses the strict "exact format" rule.

import { parseCsv, headerIndex, pick } from '../csv';
import { normaliseRow } from './base';
import type { ParseResult, WorkerImportRow, WorkerImportError } from '../types';

const ALIASES = {
  first_name: ['Employee First Name', 'First Name', 'Given Name', 'FirstName'],
  last_name: ['Employee Last Name', 'Last Name', 'Surname', 'LastName'],
  phone: ['Mobile Phone', 'Mobile Number', 'Mobile', 'Phone'],
  email: ['Email Address', 'Email', 'Personal Email'],
  employee_id: ['Employee ID', 'Employee Id', 'Employee Number', 'Payroll ID'],
  pay_rate: ['Hourly Rate', 'Pay Rate', 'Standard Hourly Rate', 'Rate'],
  award_classification: ['Award Classification', 'Classification', 'Award'],
};

export function parseEmploymentHeroCsv(
  input: string,
  company_id: string,
): ParseResult {
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
    if (dataRow.every((c) => c.trim().length === 0)) continue;

    const result = normaliseRow(
      {
        source_row: r + 1,
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
