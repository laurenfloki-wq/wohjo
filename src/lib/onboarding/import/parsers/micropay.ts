// Micropay (Sage) employee CSV parser.
//
// Micropay's standard employee export uses:
//   FirstName | LastName | Mobile | Email | EmployeeCode | BaseRate
//   AwardCode
//
// Micropay is the legacy entrant of the five — its export format
// reflects its longer history with Australian payroll. The phone
// column is consistently "Mobile" and pay rate is "BaseRate".

import { parseCsv, headerIndex, pick } from '../csv';
import { normaliseRow } from './base';
import type { ParseResult, WorkerImportRow, WorkerImportError } from '../types';

const ALIASES = {
  first_name: ['FirstName', 'First Name', 'Given Name'],
  last_name: ['LastName', 'Last Name', 'Surname'],
  phone: ['Mobile', 'MobilePhone', 'Mobile Phone', 'Phone'],
  email: ['Email', 'EmailAddress', 'Email Address'],
  employee_id: ['EmployeeCode', 'Employee Code', 'EmployeeId', 'Employee Id'],
  pay_rate: ['BaseRate', 'Base Rate', 'HourlyRate', 'Hourly Rate', 'Rate'],
  award_classification: ['AwardCode', 'Award Code', 'Award', 'Classification'],
};

export function parseMicropayCsv(
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
