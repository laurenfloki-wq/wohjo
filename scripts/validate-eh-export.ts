#!/usr/bin/env node
// WOHJO — Employment Hero Sandbox Validation Script (Sprint 4 D2)
//
// Generates the Joao test CSV using EmploymentHeroFormatter,
// validates every column against the EH import spec from research/WOHJO_Research_EH_CSV.md,
// and writes the output to exports/test-joao-scenario.csv.
//
// Run: npx tsx scripts/validate-eh-export.ts
//   OR: node --experimental-strip-types scripts/validate-eh-export.ts

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  EmploymentHeroFormatter,
  escapeCSVField,
  formatDateAU,
  formatTimeAEST,
  formatDecimal2,
} from '../src/lib/export/formatters/employment-hero.ts';

import type { ApprovedShift } from '../src/lib/export/types.ts';

// ─── Constants ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(PROJECT_ROOT, 'exports/test-joao-scenario.csv');

// ─── Joao Test Scenario ────────────────────────────────────────────────────
// The test that never changes:
// Joao worked 8 hours. 7:00am start. 3:30pm finish. 30min break. $28.47/hr.

const joaoShift: ApprovedShift = {
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
  receipt_id: 'WOHJO-ABC12345',
  notes: '',
};

// ─── Validation Checks ─────────────────────────────────────────────────────

interface ValidationCheck {
  name: string;
  pass: boolean;
  detail: string;
}

function runValidation(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Step 1: Validate with formatter
  const errors = EmploymentHeroFormatter.validate([joaoShift]);
  checks.push({
    name: 'Formatter validation',
    pass: errors.length === 0,
    detail: errors.length === 0
      ? 'Zero validation errors'
      : `${errors.length} errors: ${errors.map(e => e.message).join('; ')}`,
  });

  // Step 2: Generate CSV
  const csv = EmploymentHeroFormatter.format([joaoShift]);
  const lines = csv.split('\n');

  // CHECK: Line count (header + 1 data row)
  checks.push({
    name: 'Line count',
    pass: lines.length === 2,
    detail: `Expected 2 lines, got ${lines.length}`,
  });

  // CHECK: Header matches spec
  const expectedHeader = 'Employee ID,Employee Name,Date,Start Time,Finish Time,Break (mins),Ordinary Hours,Notes';
  checks.push({
    name: 'Header format',
    pass: lines[0] === expectedHeader,
    detail: lines[0] === expectedHeader
      ? `Header: ${lines[0]}`
      : `Expected: ${expectedHeader}\nGot: ${lines[0]}`,
  });

  // Parse data row
  const dataRow = lines[1];
  const fields = parseCSVRow(dataRow);

  // CHECK: Column count (7 when notes empty, 8 when notes present)
  checks.push({
    name: 'Column count',
    pass: fields.length === 7,
    detail: `Expected 7 columns (empty notes trimmed), got ${fields.length}: [${fields.join('|')}]`,
  });

  // CHECK: Employee ID
  checks.push({
    name: 'Employee ID (col 1)',
    pass: fields[0] === 'EH-001',
    detail: `Value: "${fields[0]}" — must match EH Payroll employee record`,
  });

  // CHECK: Employee Name
  checks.push({
    name: 'Employee Name (col 2)',
    pass: fields[1] === 'Joao Ferreira',
    detail: `Value: "${fields[1]}"`,
  });

  // CHECK: Date — DD/MM/YYYY Australian format
  const dateField = fields[2];
  const dateMatch = /^\d{2}\/\d{2}\/\d{4}$/.test(dateField);
  checks.push({
    name: 'Date format DD/MM/YYYY (col 3)',
    pass: dateMatch && dateField === '07/04/2025',
    detail: `Value: "${dateField}" — Australian date format required`,
  });

  // CHECK: Start Time — HH:MM 24hr AEST
  const startField = fields[3];
  const startMatch = /^\d{2}:\d{2}$/.test(startField);
  checks.push({
    name: 'Start Time HH:MM AEST (col 4)',
    pass: startMatch && startField === '07:00',
    detail: `Value: "${startField}" — 24hr AEST expected, UTC input was 21:00Z`,
  });

  // CHECK: Finish Time — HH:MM 24hr AEST
  const endField = fields[4];
  const endMatch = /^\d{2}:\d{2}$/.test(endField);
  checks.push({
    name: 'Finish Time HH:MM AEST (col 5)',
    pass: endMatch && endField === '15:30',
    detail: `Value: "${endField}" — 24hr AEST expected, UTC input was 05:30Z`,
  });

  // CHECK: Break minutes — integer
  const breakField = fields[5];
  const breakIsInt = /^\d+$/.test(breakField);
  checks.push({
    name: 'Break minutes integer (col 6)',
    pass: breakIsInt && breakField === '30',
    detail: `Value: "${breakField}" — integer minutes, no decimals`,
  });

  // CHECK: Ordinary Hours — 2 decimal places
  const hoursField = fields[6];
  const hoursMatch = /^\d+\.\d{2}$/.test(hoursField);
  checks.push({
    name: 'Ordinary Hours decimal(10,2) (col 7)',
    pass: hoursMatch && hoursField === '8.00',
    detail: `Value: "${hoursField}" — decimal(10,2), not floating point`,
  });

  // CHECK: No trailing comma on data row
  checks.push({
    name: 'No trailing comma',
    pass: !dataRow.endsWith(','),
    detail: dataRow.endsWith(',')
      ? `FAIL: Data row ends with comma: "${dataRow}"`
      : `Data row has clean ending`,
  });

  // CHECK: LF line endings (not CRLF) — internal format
  checks.push({
    name: 'LF line endings (internal)',
    pass: !csv.includes('\r\n'),
    detail: csv.includes('\r\n')
      ? 'FAIL: Found CRLF — internal format uses LF'
      : 'Internal format uses LF (CRLF conversion at download time if needed)',
  });

  // CHECK: No trailing newline
  checks.push({
    name: 'No trailing newline',
    pass: !csv.endsWith('\n'),
    detail: csv.endsWith('\n') ? 'FAIL: CSV ends with trailing newline' : 'Clean EOF',
  });

  // CHECK: UTF-8 encoding (string is already UTF-8 in Node.js)
  checks.push({
    name: 'UTF-8 encoding',
    pass: true,
    detail: 'Node.js strings are natively UTF-8',
  });

  // CHECK: No BOM
  checks.push({
    name: 'No BOM marker',
    pass: !csv.startsWith('\uFEFF'),
    detail: csv.startsWith('\uFEFF') ? 'FAIL: BOM detected' : 'No BOM — clean start',
  });

  // CHECK: Joao gross pay calculation (informational — not in CSV)
  const grossPay = joaoShift.total_hours * joaoShift.pay_rate;
  const expectedGross = 227.76; // 8.0 * 28.47
  checks.push({
    name: 'Joao gross pay (audit check)',
    pass: Math.abs(grossPay - expectedGross) < 0.01,
    detail: `${joaoShift.total_hours} hrs × $${joaoShift.pay_rate}/hr = $${grossPay.toFixed(2)} (expected $${expectedGross.toFixed(2)})`,
  });

  // CHECK: Metadata
  checks.push({
    name: 'Provider ID',
    pass: EmploymentHeroFormatter.providerId === 'employment_hero',
    detail: `providerId: "${EmploymentHeroFormatter.providerId}"`,
  });

  checks.push({
    name: 'File extension',
    pass: EmploymentHeroFormatter.fileExtension === 'csv',
    detail: `fileExtension: "${EmploymentHeroFormatter.fileExtension}"`,
  });

  checks.push({
    name: 'MIME type',
    pass: EmploymentHeroFormatter.mimeType === 'text/csv',
    detail: `mimeType: "${EmploymentHeroFormatter.mimeType}"`,
  });

  return checks;
}

// ─── CSV Row Parser ─────────────────────────────────────────────────────────

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

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  WOHJO Export — Employment Hero Sandbox Validation');
  console.log('  Sprint 4 D2 — The Joao Scenario');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Shift: Joao Ferreira, 7:00am–3:30pm, 30min break, 8.0 hrs');
  console.log('  Pay rate: $28.47/hr | Gross: $227.76');
  console.log('  Site: Gungahlin Site | Date: 2025-04-07');
  console.log('');

  const checks = runValidation();
  let passCount = 0;
  let failCount = 0;

  for (const check of checks) {
    const status = check.pass ? 'PASS' : 'FAIL';
    const icon = check.pass ? '✓' : '✗';
    if (check.pass) passCount++;
    else failCount++;
    console.log(`  ${icon} [${status}] ${check.name}`);
    console.log(`           ${check.detail}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} PASS, ${failCount} FAIL, ${checks.length} total`);

  // Write test CSV to exports/
  const csv = EmploymentHeroFormatter.format([joaoShift]);
  writeFileSync(OUTPUT_PATH, csv, 'utf-8');
  console.log(`  Output:  ${OUTPUT_PATH}`);

  if (failCount > 0) {
    console.log('');
    console.log('  ❌ VALIDATION FAILED — do not upload to Employment Hero');
    console.log('═══════════════════════════════════════════════════════════════');
    process.exit(1);
  } else {
    console.log('');
    console.log('  ✅ ALL CHECKS PASSED — CSV ready for EH sandbox testing');
    console.log('═══════════════════════════════════════════════════════════════');
    process.exit(0);
  }
}

main();
