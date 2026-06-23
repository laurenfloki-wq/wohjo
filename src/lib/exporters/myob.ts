// ─────────────────────────────────────────────────────────────────
// MYOB AccountRight Timesheet Exporter
// ─────────────────────────────────────────────────────────────────
//
// Authored:  Cowork Monday 5 May 2026 (feature/myob-exporter branch)
// For:       Mo (Dass Labour Hire) Mon 12 May pay run
// Format:    MYOB AccountRight Timesheet Import (.txt, tab-separated)
//
// FORMAT SPEC (verified against MYOB AccountRight documentation)
//
//   - File extension: .txt (NOT .csv — MYOB rejects comma-delimited
//     timesheet imports for this import type)
//   - Tab-separated values (NOT commas)
//   - Cell A1: literal `{}` — MYOB's import-file marker (mandatory)
//   - Row 2: column headers
//   - Row 3+: data rows
//   - Mandatory columns: Date, Card ID, Activity ID, Units
//   - Optional columns: Job, Notes, Start Time, Stop Time
//   - Date format: DD/MM/YYYY
//   - Units: decimal hours (e.g. 7.50)
//   - Match by Card ID, NOT Last Name (avoids hyphen/spelling failures)
//
// NOT a payroll-API integration. This is the bookkeeper-mediated
// transitional pattern from the existing src/lib/export/formatters/
// architecture (Architecture D, last reviewed 2026-04-25). The class
// here uses a different signature (mappings parameter) because MYOB
// requires per-tenant activity-ID translation; the existing formatters
// don't have that per-tenant indirection. The two co-exist; this one
// is the canonical MYOB path going forward.
//
// SUBSTRATE-DD NOTE
//
// The existing src/lib/export/formatters/myob.ts stub is left in place
// to preserve the /api/command/export?provider_id=myob behaviour
// (which currently throws). A future cleanup pass should consolidate
// — flagged in feature/myob-exporter closeout for Lauren review.

// ─── Types ────────────────────────────────────────────────────────

export type FlostructionCategory =
  | 'ordinary_hours'
  | 'overtime_1_5x'
  | 'overtime_2x'
  | 'rdo_deductions_cw2'
  | 'travel_allowance'
  | 'meal_allowance'
  | 'inclement_weather_cw2'
  | 'multi_storey_allowance'
  // Catch-all for tenant-specific custom categories. Mappings still
  // resolve via tenant_activity_mappings.flostruction_category match.
  | string;

/** A single shift row to be exported to MYOB. */
export interface MyobShift {
  /** Worker's MYOB Card ID (e.g. *0001). Required. Workers without
   *  a card_id are skipped at the API layer with a surfaced warning. */
  card_id: string;
  /** Date the work occurred — UTC midnight in shift_date field, but
   *  we emit DD/MM/YYYY in the worker's local timezone (AEST). */
  shift_date: string; // YYYY-MM-DD (input)
  /** FLOSTRUCTION canonical category. Translated via mappings. */
  category: FlostructionCategory;
  /** Per-worker resolved MYOB Activity ID. When set (non-empty) it is
   *  used verbatim and the company `mappings`/`category` lookup is
   *  bypassed — this is the per-worker `activity_mappings` path. Left
   *  undefined for the legacy company-mapping path, which preserves the
   *  pre-existing category→mappings resolution (and all its unit tests). */
  activity_id?: string;
  /** Decimal hours. Negative permitted for RDO deductions. */
  units: number;
  /** Optional Job code (typically site_code). */
  job?: string;
  /** Optional notes. Tab and newline characters are stripped to
   *  preserve TSV format integrity. */
  notes?: string;
  /** Optional start_time (ISO 8601). Emitted as HH:MM if present. */
  start_time?: string;
  /** Optional stop_time (ISO 8601). Emitted as HH:MM if present. */
  stop_time?: string;
}

/** Per-tenant mapping from FLOSTRUCTION category → MYOB Activity ID. */
export interface ActivityMapping {
  flostruction_category: FlostructionCategory;
  myob_activity_id: string;
}

/** Per-shift warning surfaced when a category has no mapping. */
export interface MyobExportWarning {
  shift_date: string;
  card_id: string;
  category: FlostructionCategory;
  reason: 'NO_MAPPING' | 'EMPTY_CARD_ID' | 'EMPTY_ACTIVITY_ID';
}

/** Result of a format() call. */
export interface MyobFormatResult {
  /** The TSV file body. Always at least the marker + header rows
   *  even if data rows is empty (so MYOB can recognise it as a
   *  legitimate empty timesheet rather than a malformed file). */
  body: string;
  /** Number of data rows written. */
  rowCount: number;
  /** Per-shift warnings. Shifts with warnings are SKIPPED, not
   *  silently included with bad data. The caller MUST surface
   *  these to the admin. */
  warnings: MyobExportWarning[];
}

/**
 * CRACK 229 (2026-05-11) — format options for the bookkeeper-facing
 * export. Defaults preserve the MYOB-spec-compliant pre-CRACK-229
 * behaviour so the 60 prior unit tests continue to pin format
 * invariants. The /api/exports/myob route opts into the
 * Mo-Week-1 oracle format (no marker, ISO date, default activity ID,
 * mandatory-columns-only).
 *
 * Why options rather than two classes: the substrate-DD posture is to
 * keep ONE exporter and parameterise the variants explicitly. A second
 * class would invite drift between two implementations of the same
 * MYOB spec.
 */
export interface MyobFormatOptions {
  /** Whether to emit the literal `{}` MYOB import-file marker as the
   *  first line. Default true. Mo's first pay run sets this to false
   *  because his bookkeeper imports via the AccountRight TSV importer
   *  which treats `{}` as a stray row rather than the marker — the
   *  spec is permissive but Mo's environment isn't. */
  includeMarker?: boolean;
  /** Date format for the Date column. Default 'DD/MM/YYYY' (the strict
   *  MYOB spec). Set to 'YYYY-MM-DD' for the Mo-Week-1 oracle which
   *  matches what the bookkeeper sees in his prior CSV imports. */
  dateFormat?: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  /** When a shift's `category` has no mapping in `mappings`, fall back
   *  to this Activity ID instead of emitting a `NO_MAPPING` warning
   *  and skipping the row. Required for tenants whose admin hasn't
   *  populated `tenant_activity_mappings` yet — without it Mo's Week 1
   *  export emits an empty data set (CRACK 229 root cause). Default
   *  undefined (preserve strict pre-CRACK-229 skip-with-warning). */
  defaultActivityId?: string;
}

// ─── Constants ────────────────────────────────────────────────────

/** MYOB import-file marker — mandatory in cell A1. */
export const MYOB_MARKER = '{}';

/** Tab character — TSV field separator. */
const TAB = '\t';

/** CRLF line ending — MYOB expects Windows line endings. */
const CRLF = '\r\n';

/** Canonical column order. Mandatory columns come first; optional
 *  columns are emitted only if any shift in the batch supplies them. */
const MANDATORY_COLUMNS = ['Date', 'Card ID', 'Activity ID', 'Units'] as const;
const OPTIONAL_COLUMNS = ['Job', 'Notes', 'Start Time', 'Stop Time'] as const;

// ─── Helpers ──────────────────────────────────────────────────────

/** Format a YYYY-MM-DD date string as DD/MM/YYYY.
 *  Throws on malformed input — calling code must pre-validate.
 *  CRACK 229: see `formatMyobDateIso` for the YYYY-MM-DD pass-through
 *  alternative used by the route. */
export function formatMyobDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new Error(`Invalid date format: "${isoDate}". Expected YYYY-MM-DD.`);
  }
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

/** CRACK 229 — pass-through ISO-date format. The substrate already
 *  stores shift_date as YYYY-MM-DD; this helper validates the format
 *  and returns it verbatim. MYOB accepts both YYYY-MM-DD and DD/MM/YYYY
 *  for timesheet imports; we use ISO to match the bookkeeper's prior
 *  CSV imports and avoid locale-of-the-importer ambiguity. */
export function formatMyobDateIso(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) {
    throw new Error(`Invalid date format: "${isoDate}". Expected YYYY-MM-DD.`);
  }
  return isoDate;
}

/** Format a decimal hours value as a 2-decimal string (e.g. 7.5 → "7.50").
 *  Negative values preserved (RDO deductions per Joao's payslip). */
export function formatMyobUnits(units: number): string {
  if (!Number.isFinite(units)) {
    throw new Error(`Invalid units value: ${units}. Must be a finite number.`);
  }
  return units.toFixed(2);
}

/** Extract HH:MM (24h) from an ISO 8601 timestamp.
 *  Returns the local-time portion of the original ISO string —
 *  no timezone conversion. Caller responsible for ensuring the ISO
 *  string is in the desired display timezone. */
export function formatMyobTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) {
    throw new Error(`Invalid ISO timestamp: "${iso}". Expected ...THH:MM...`);
  }
  return `${m[1]}:${m[2]}`;
}

/** Strip characters that would break the TSV format (tab, newline). */
function sanitiseField(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/[\t\r\n]/g, ' ');
}

// ─── MYOBExporter class ───────────────────────────────────────────

export class MYOBExporter {
  /** Build the TSV body from shifts + per-tenant activity mappings.
   *
   *  Behaviour:
   *  - Shifts whose category has no mapping → SKIPPED with warning.
   *  - Shifts with empty card_id → SKIPPED with warning.
   *  - Shifts with empty resolved activity_id → SKIPPED with warning.
   *  - Optional columns (Job/Notes/Start/Stop) are included only if
   *    at least one INCLUDED shift supplies any of them.
   *  - Always emits the marker + header rows (even if rowCount=0),
   *    so MYOB recognises an empty timesheet as legitimate.
   *
   *  Returns { body, rowCount, warnings }. The caller MUST surface
   *  warnings — silently dropped shifts are a substrate-DD violation.
   */
  format(
    shifts: MyobShift[],
    mappings: ActivityMapping[],
    options: MyobFormatOptions = {},
  ): MyobFormatResult {
    const { includeMarker = true, dateFormat = 'DD/MM/YYYY', defaultActivityId } = options;
    const formatDate = dateFormat === 'YYYY-MM-DD' ? formatMyobDateIso : formatMyobDate;

    // Index mappings for O(1) category → activity_id resolution.
    const mappingIndex = new Map<string, string>();
    for (const m of mappings) {
      // Trim whitespace to defend against admin-form padding.
      const cat = m.flostruction_category.trim();
      const aid = m.myob_activity_id.trim();
      if (cat.length > 0) {
        mappingIndex.set(cat, aid);
      }
    }

    const warnings: MyobExportWarning[] = [];
    const includedRows: Array<{
      date: string;
      card_id: string;
      activity_id: string;
      units: string;
      job: string;
      notes: string;
      start_time: string;
      stop_time: string;
    }> = [];

    let anyJob = false;
    let anyNotes = false;
    let anyStartTime = false;
    let anyStopTime = false;

    for (const shift of shifts) {
      // Card ID validation
      const cardId = (shift.card_id ?? '').trim();
      if (cardId.length === 0) {
        warnings.push({
          shift_date: shift.shift_date,
          card_id: '',
          category: shift.category,
          reason: 'EMPTY_CARD_ID',
        });
        continue;
      }

      // Activity mapping resolution.
      // Per-worker path: a shift may carry its own resolved activity_id
      // (from workers.activity_mappings). When present it wins outright —
      // the per-worker code is what the bookkeeper expects for that person,
      // so neither the company mappings nor the category matter. When
      // absent we fall through to the legacy company-mapping resolution.
      // CRACK 229: if no per-tenant mapping exists for this category AND a
      // defaultActivityId is supplied, fall back to that default rather than
      // skipping the row. The fallback is opt-in — without it the
      // pre-CRACK-229 strict skip-with-warning behaviour is preserved.
      let activityId = (shift.activity_id ?? '').trim();
      if (activityId.length === 0) {
        activityId = mappingIndex.get(shift.category)?.trim() ?? '';
      }
      if (activityId.length === 0) {
        if (defaultActivityId && defaultActivityId.trim().length > 0) {
          activityId = defaultActivityId.trim();
        } else {
          warnings.push({
            shift_date: shift.shift_date,
            card_id: cardId,
            category: shift.category,
            reason: mappingIndex.has(shift.category) ? 'EMPTY_ACTIVITY_ID' : 'NO_MAPPING',
          });
          continue;
        }
      }

      const job = sanitiseField(shift.job);
      const notes = sanitiseField(shift.notes);
      const startTime = shift.start_time ? formatMyobTime(shift.start_time) : '';
      const stopTime = shift.stop_time ? formatMyobTime(shift.stop_time) : '';

      if (job) anyJob = true;
      if (notes) anyNotes = true;
      if (startTime) anyStartTime = true;
      if (stopTime) anyStopTime = true;

      includedRows.push({
        date: formatDate(shift.shift_date),
        card_id: cardId,
        activity_id: activityId,
        units: formatMyobUnits(shift.units),
        job,
        notes,
        start_time: startTime,
        stop_time: stopTime,
      });
    }

    // Build header: mandatory columns + any optional columns that
    // appear in the included data set.
    const headers: string[] = [...MANDATORY_COLUMNS];
    const includeJob = anyJob;
    const includeNotes = anyNotes;
    const includeStart = anyStartTime;
    const includeStop = anyStopTime;
    if (includeJob) headers.push('Job');
    if (includeNotes) headers.push('Notes');
    if (includeStart) headers.push('Start Time');
    if (includeStop) headers.push('Stop Time');

    const lines: string[] = [];

    // Row 1: marker (cell A1) — single field, no other content.
    // The remainder of row 1 is intentionally empty per MYOB spec.
    // CRACK 229: opt-out via options.includeMarker=false for the Mo
    // Week 1 importer which treats the marker as a stray row.
    if (includeMarker) {
      lines.push(MYOB_MARKER);
    }

    // Headers (TAB-separated) — row 2 if marker included, row 1 otherwise.
    lines.push(headers.join(TAB));

    // Data rows
    for (const r of includedRows) {
      const cols: string[] = [r.date, r.card_id, r.activity_id, r.units];
      if (includeJob) cols.push(r.job);
      if (includeNotes) cols.push(r.notes);
      if (includeStart) cols.push(r.start_time);
      if (includeStop) cols.push(r.stop_time);
      lines.push(cols.join(TAB));
    }

    return {
      body: lines.join(CRLF) + CRLF,
      rowCount: includedRows.length,
      warnings,
    };
  }
}
