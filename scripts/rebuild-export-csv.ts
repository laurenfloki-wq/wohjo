// ---------------------------------------------------------------
// CRACK 229 — rebuild an existing MYOB export CSV without touching
// the substrate.
//
// Lauren ran the export at 2026-05-11 05:06 UTC and got a file with
// `{}` + header + 0 data rows. The substrate is correct (4 EXPORTED
// shifts, 4 EXPORT_RECORD events, chain-OK) — the bug is in the
// presentation layer only. This script reads the existing
// `exports` row, re-fetches the shift records by id, re-renders the
// CSV via the post-CRACK-229 MYOBExporter with the Mo-Week-1 oracle
// options, and prints to stdout. No substrate writes; no
// `exports`, `shifts`, `shift_events` mutations.
//
// Usage:
//   npx tsx scripts/rebuild-export-csv.ts <export_id>
//
// Env vars required (read from .env.local or process.env):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Output: writes the rebuilt CSV body to stdout. Exit code 0 on
// success, 1 on validation failure, 2 on env-var or fetch failure.
// ---------------------------------------------------------------

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { MYOBExporter, type MyobShift, type ActivityMapping } from '../src/lib/exporters/myob';

// ─── env loader ──────────────────────────────────────────────────
function loadEnv(): void {
  const envPath = '.env.local';
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'rebuild-export-csv: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.',
  );
  process.exit(2);
}

const exportId = process.argv[2];
if (!exportId) {
  console.error('Usage: npx tsx scripts/rebuild-export-csv.ts <export_id>');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

interface ExportRow {
  id: string;
  company_id: string;
  total_shifts: number;
  total_hours: string;
  shift_ids: string[];
  exported_at: string;
}

interface ShiftRow {
  id: string;
  shift_date: string;
  total_hours: string | null;
  receipt_id: string;
  workers: { employee_id: string; myob_card_id: string | null } | null;
}

async function main(): Promise<void> {
  // ── 1. Fetch the exports row ───────────────────────────────────
  const { data: exportData, error: exportErr } = await supabase
    .from('exports')
    .select('id, company_id, total_shifts, total_hours, shift_ids, exported_at')
    .eq('id', exportId)
    .maybeSingle();
  if (exportErr || !exportData) {
    console.error(`rebuild-export-csv: exports row not found: ${exportId}`);
    if (exportErr) console.error(exportErr.message);
    process.exit(1);
  }
  const exportRow = exportData as ExportRow;
  console.error(
    `[diagnostic] export ${exportRow.id} — ${exportRow.total_shifts} shift(s), total_hours=${exportRow.total_hours}, exported_at=${exportRow.exported_at}`,
  );

  // ── 2. Fetch the underlying shifts ─────────────────────────────
  const { data: shiftRows, error: shiftErr } = await supabase
    .from('shifts')
    .select(
      `
      id, shift_date, total_hours, receipt_id,
      workers(employee_id, myob_card_id)
    `,
    )
    .in('id', exportRow.shift_ids);
  if (shiftErr || !shiftRows) {
    console.error('rebuild-export-csv: failed to fetch shifts');
    if (shiftErr) console.error(shiftErr.message);
    process.exit(2);
  }
  const shifts = shiftRows as unknown as ShiftRow[];

  // ── 3. Fetch per-tenant activity mappings ──────────────────────
  const { data: mappingRows } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id')
    .eq('tenant_id', exportRow.company_id);
  const mappings: ActivityMapping[] = (mappingRows ?? []).map(
    (m: { flostruction_category: string; myob_activity_id: string }) => ({
      flostruction_category: m.flostruction_category,
      myob_activity_id: m.myob_activity_id,
    }),
  );
  console.error(
    `[diagnostic] tenant_activity_mappings for company ${exportRow.company_id}: ${mappings.length} row(s)${mappings.length === 0 ? ' (will fall back to defaultActivityId=LABOUR)' : ''}`,
  );

  // ── 4. Project shifts to MyobShift records ─────────────────────
  // CRACK 229 — sort by shift_date so the rebuilt file is in the same order
  // as the dispatch oracle (ascending by date).
  const sorted = [...shifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date));
  const myobShifts: MyobShift[] = sorted.map((s) => ({
    card_id: s.workers?.myob_card_id?.trim() || s.workers?.employee_id?.trim() || '',
    shift_date: s.shift_date,
    category: 'ordinary_hours',
    units: parseFloat(s.total_hours ?? '0'),
  }));

  // ── 5. Render via the exporter with the Mo-Week-1 oracle options ─
  const exporter = new MYOBExporter();
  const result = exporter.format(myobShifts, mappings, {
    includeMarker: false,
    dateFormat: 'YYYY-MM-DD',
    defaultActivityId: 'LABOUR',
  });

  // ── 6. Diagnostic: warnings + row count ────────────────────────
  console.error(
    `[diagnostic] rendered ${result.rowCount} data row(s); ${result.warnings.length} warning(s).`,
  );
  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.error(`[warning] ${w.shift_date} ${w.card_id} ${w.category} → ${w.reason}`);
    }
  }

  // ── 7. Receipt → date linkage (diagnostic only, not in CSV) ────
  console.error('[diagnostic] receipt linkage:');
  for (const s of sorted) {
    console.error(`  ${s.shift_date} → ${s.receipt_id} (${s.total_hours} hrs)`);
  }

  // ── 8. CSV body → stdout ───────────────────────────────────────
  process.stdout.write(result.body);
}

main().catch((err) => {
  console.error('rebuild-export-csv: unhandled error:', err);
  process.exit(2);
});
