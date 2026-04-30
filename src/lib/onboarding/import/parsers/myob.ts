// MYOB AccountRight / MYOB Business employee CSV parser.
//
// MYOB exports use Card File (employee card) export format with
// commonly-seen columns:
//   First Name | Surname | Phone Number | Email | Card ID | Pay Rate
//   Award Code
//
// MYOB historically uses "Card ID" as the equivalent of employee_id;
// some exports also expose "Employee ID" or "Payroll No". The phone
// column is variously "Phone Number" or "Phone 1" or "Mobile".

import { parseCsv, headerIndex, pick } from '../csv';
import { normaliseRow } from './base';
import type { ParseResult, WorkerImportRow, WorkerImportError } from '../types';

const ALIASES = {
  first_name: ['First Name', 'FirstName', 'Given Name'],
  last_name: ['Surname', 'Last Name', 'LastName', 'Family Name'],
  phone: ['Phone Number', 'Phone', 'Phone 1', 'Mobile', 'Mobile Number'],
  email: ['Email', 'Email Address'],
  employee_id: ['Card ID', 'Card Id', 'Employee ID', 'Employee Id', 'Payroll No'],
  pay_rate: ['Pay Rate', 'Hourly Rate', 'Rate'],
  award_classification: ['Award Code', 'Award Classification', 'Classification'],
};

export function parseMyobCsv(input: string, company_id: string): ParseResult {
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
