// FLOSTRUCTION — payroll-import file artefact (M4-G).
//
// Produces the format-aware payroll-import artefact for a single
// export operation. MYOB ships as .xlsx via SheetJS (CDN-distributed,
// HIGH-severity advisory free unlike the npm `xlsx` package — see
// package.json install URL). Other targets fall back to RFC-4180 CSV
// with UTF-8 BOM so spreadsheet apps detect the encoding.
//
// Activity-mapping discipline: a 0-row tenant_activity_mappings table
// for the tenant is a SETUP BLOCKER, not a silent default. The
// generator throws TenantActivityMappingMissing so the caller can
// surface a setup-blocker UI on /command/payroll-mapping.

import * as XLSX from 'xlsx';

/**
 * Per-shift row sent to the payroll target. The translator chooses
 * which canonical category each shift maps to (ordinary_hours by
 * default; overtime variants and allowances when present).
 */
export interface PayrollFileRow {
  employee_id: string;
  full_name: string;
  myob_card_id?: string | null;     // optional — MYOB matches by Card ID
  shift_date: string;                // YYYY-MM-DD
  total_hours: number;               // decimal hours, 2dp
  category: string;                  // FLOSTRUCTION canonical key
  receipt_id: string;                // FSTR-XXXXXXXX
}

/**
 * Tenant-specific mapping from FLOSTRUCTION canonical category names
 * (`ordinary_hours`, `overtime_1_5x`, `travel_allowance`, ...) to the
 * customer's MYOB Activity ID strings. One row per category that the
 * tenant uses. Loaded once at export time from
 * public.tenant_activity_mappings.
 */
export type TenantActivityMappings = Map<string, string>;

export class TenantActivityMappingMissing extends Error {
  readonly code = 'TENANT_ACTIVITY_MAPPING_MISSING';
  constructor(missing: string[]) {
    super(
      'Activity mapping missing for: ' + missing.join(', ') + '. '
      + 'Configure tenant_activity_mappings before exporting.',
    );
    this.name = 'TenantActivityMappingMissing';
  }
  readonly missing: string[] = [];
}

/**
 * MYOB AccountRight timesheet shape, deterministic order, header
 * row first. Card ID column is required for MYOB matching — workers
 * without one are NOT emitted (caller filters upstream and surfaces
 * the omission separately).
 *
 * Returns the binary .xlsx as a Buffer suitable for upload to
 * Supabase Storage.
 */
export function buildMyobXlsx(input: {
  rows: PayrollFileRow[];
  mappings: TenantActivityMappings;
  company_name: string;
  pay_period_start: string;
  pay_period_end: string;
}): Buffer {
  // Collect distinct categories the export touches; any missing
  // mapping is a setup blocker.
  const usedCategories = new Set<string>(input.rows.map((r) => r.category));
  const missing: string[] = [];
  for (const cat of usedCategories) {
    if (!input.mappings.has(cat)) missing.push(cat);
  }
  if (missing.length > 0) {
    throw new TenantActivityMappingMissing(missing);
  }

  // MYOB AccountRight timesheet columns. Order is significant:
  // MYOB matches columns positionally during import.
  const header = [
    'Card ID',
    'Employee Name',
    'Date Worked',
    'Activity ID',
    'Hours',
    'Notes',
  ];
  const data: Array<Array<string | number>> = [header];
  for (const r of input.rows) {
    if (!r.myob_card_id) continue;       // skip; surfaced as a warning upstream
    data.push([
      r.myob_card_id,
      r.full_name,
      r.shift_date,
      input.mappings.get(r.category)!,
      Number(r.total_hours.toFixed(2)),
      r.receipt_id,
    ]);
  }

  // Workbook assembly. Single sheet — MYOB ignores additional sheets.
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');

  // Deterministic write — no creation timestamp written into the file
  // so the file_hash is reproducible across runs of the same input.
  const out = XLSX.write(wb, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true,
  }) as Buffer;
  return out;
}

/**
 * RFC 4180 CSV with UTF-8 BOM. Used for non-MYOB targets that ask
 * for a CSV. CRLF line endings, double-quote escaped, comma-separated.
 * BOM 0xEF 0xBB 0xBF prefixes the file so Excel/Numbers detect UTF-8
 * without prompting.
 */
export function buildRfc4180Csv(input: {
  rows: PayrollFileRow[];
  mappings: TenantActivityMappings;
}): Buffer {
  const usedCategories = new Set<string>(input.rows.map((r) => r.category));
  const missing: string[] = [];
  for (const cat of usedCategories) {
    if (!input.mappings.has(cat)) missing.push(cat);
  }
  if (missing.length > 0) {
    throw new TenantActivityMappingMissing(missing);
  }

  const header = [
    'employee_id', 'full_name', 'card_id', 'shift_date',
    'activity_id', 'hours', 'receipt_id',
  ];
  const lines: string[] = [header.map(csvEscape).join(',')];
  for (const r of input.rows) {
    lines.push([
      r.employee_id,
      r.full_name,
      r.myob_card_id ?? '',
      r.shift_date,
      input.mappings.get(r.category)!,
      r.total_hours.toFixed(2),
      r.receipt_id,
    ].map(csvEscape).join(','));
  }
  const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
  const body = Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
  return Buffer.concat([bom, body]);
}

/**
 * RFC 4180 §2.7 — if the field contains a comma, CRLF, or quote,
 * wrap in double quotes and escape any internal quote by doubling.
 * Otherwise the field is emitted as-is.
 */
function csvEscape(field: string | number): string {
  const s = String(field);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * MIME the route writes alongside the path so downstream readers
 * don't have to sniff the extension.
 */
export const MYOB_XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv; charset=utf-8';
