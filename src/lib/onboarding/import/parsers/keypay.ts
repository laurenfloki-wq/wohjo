// KeyPay (now branded "Employment Innovations Payroll" in some
// markets) employee CSV parser.
//
// KeyPay's standard employee export uses single-word column names:
//   FirstName | Surname | MobileNumber | EmailAddress | ExternalId
//   HourlyRate | Award
//
// Note: KeyPay's "ExternalId" is the integration identifier; some
// exports also use "EmployeeNumber". KeyPay phone exports default to
// AU national format with leading zero.

import { parseCsv, headerIndex, pick } from '../csv';
import { normaliseRow } from './base';
import type { ParseResult, WorkerImportRow, WorkerImportError } from '../types';

const ALIASES = {
  first_name: ['FirstName', 'First Name', 'Given Name'],
  last_name: ['Surname', 'LastName', 'Last Name'],
  phone: ['MobileNumber', 'Mobile Number', 'Mobile', 'Phone'],
  email: ['EmailAddress', 'Email Address', 'Email'],
  employee_id: ['ExternalId', 'External Id', 'EmployeeNumber', 'Employee Number'],
  pay_rate: ['HourlyRate', 'Hourly Rate', 'PayRate', 'Pay Rate'],
  award_classification: ['Award', 'AwardClassification', 'Award Classification'],
};

export function parseKeypayCsv(input: string, company_id: string): ParseResult {
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
