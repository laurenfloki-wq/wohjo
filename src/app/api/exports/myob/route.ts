// ─────────────────────────────────────────────────────────────────
// /api/exports/myob — MYOB AccountRight timesheet export
// ─────────────────────────────────────────────────────────────────
//
// Authored:  Cowork Monday 5 May 2026 (feature/myob-exporter branch)
// For:       Mo (Dass Labour Hire) Mon 12 May pay run
// Method:    POST
// Body:      { pay_period_start: 'YYYY-MM-DD', pay_period_end: 'YYYY-MM-DD' }
//
// Returns 200 + JSON on success:
//   { content: string, filename: string, row_count: number,
//     warnings: MyobExportWarning[] }
//
// The CALLER (admin UI) is responsible for either downloading the
// file or surfacing warnings to the admin. Warnings are NEVER
// silently dropped — that's a substrate-DD violation.
//
// SCOPE — what this route DOES
//
// 1. Authenticates via getCompanyIdForSession() (same pattern as
//    /api/command/export — the canonical Class-A admin route auth).
// 2. Fetches PAYROLL_APPROVED shifts for the tenant in the given
//    pay period (re-uses getApprovedShifts).
// 3. Fetches the worker's myob_card_id via a separate query
//    (getApprovedShifts doesn't carry that field; rather than mutate
//    that shared function and risk side-effects on /api/command/export,
//    we do a tenant-scoped lookup here).
// 4. Fetches the tenant's activity mappings.
// 5. For each shift: generates ONE MyobShift row in category
//    'ordinary_hours' (see SUBSTRATE-DD FINDING below).
// 6. Calls MYOBExporter.format().
// 7. Returns content + warnings.
//
// SUBSTRATE-DD FINDING (surfaced; NOT auto-resolved per HARD RULE #6)
//
// The existing shifts table has no per-shift category breakdown.
// Joao's payslip shows multiple categories per pay period (Ordinary
// Hours CW2, Overtime 1.5x CW2, RDO Deductions CW2, Travel Allowance,
// Meal Allowance, Inclement Weather CW2, Multi-Storey Allowance, etc.)
// but FLOSTRUCTION's substrate captures only total_hours per shift.
//
// For Mo's first pay run, this route emits every shift as
// 'ordinary_hours'. Mo's bookkeeper then manually adds the
// allowances + overtime breakdowns in MYOB after import — which is
// what bookkeepers do today. The exporter class itself supports all
// categories (tested in src/lib/exporters/myob.test.ts) — the
// constraint is upstream: where do per-shift category breakdowns
// come from?
//
// Three architectural options for Lauren-decision:
//   A. New shifts column: ordinary_hours, overtime_hours,
//      allowances_jsonb. Requires worker-app + supervisor-flow updates.
//   B. New shift_categories table: 1-N category rows per shift,
//      filled by a categorisation engine that consumes award rules
//      + the shift's start/stop/break.
//   C. Bookkeeper-mediated (current): ordinary_hours only, manual
//      breakdown in MYOB post-import.
//
// (C) is the Mo Week 1 path. (A) or (B) is the Phase-2 substrate.
// Flagged for founder architectural review.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { getApprovedShifts } from '@/lib/export/get-approved-shifts';
import {
  MYOBExporter,
  type ActivityMapping,
  type MyobShift,
} from '@/lib/exporters/myob';

interface RequestBody {
  pay_period_start?: string;
  pay_period_end?: string;
}

// AEST-aware filename generation; matches the existing
// /api/command/export pattern but with the .txt extension MYOB
// requires (NOT .csv).
function buildFileName(start: string, end: string): string {
  return `Flostruction_MYOB_${start}_to_${end}.txt`;
}

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/exports/myob',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  // Auth: company_id derived server-side (Day 5 P1.2 pattern).
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // Rate limit (canonical EXPORT bucket — same as /api/command/export).
  const ip = getClientIP(request);
  const rl = checkRateLimit(`exports.myob:${ip}`, RATE_LIMITS.EXPORT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 },
    );
  }

  // Body parse + validation
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { pay_period_start, pay_period_end } = body;
  if (!pay_period_start || !pay_period_end) {
    return NextResponse.json(
      { error: 'pay_period_start and pay_period_end (YYYY-MM-DD) required' },
      { status: 400 },
    );
  }
  // Strict YYYY-MM-DD shape — MYOB date formatter throws on malformed.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(pay_period_start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(pay_period_end)
  ) {
    return NextResponse.json(
      { error: 'Dates must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Fetch shifts (re-use canonical getApprovedShifts — tenant-scoped).
  let shifts;
  try {
    shifts = await getApprovedShifts({
      companyId,
      payPeriodStart: pay_period_start,
      payPeriodEnd: pay_period_end,
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'exports.myob.shifts_fetch_failed',
    );
    return NextResponse.json(
      { error: 'Failed to fetch approved shifts' },
      { status: 500 },
    );
  }

  // Fetch tenant's activity mappings.
  const { data: mappingRows, error: mappingErr } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id')
    .eq('tenant_id', companyId);
  if (mappingErr) {
    log.error({ err: mappingErr.message }, 'exports.myob.mappings_fetch_failed');
    return NextResponse.json(
      { error: 'Failed to fetch activity mappings' },
      { status: 500 },
    );
  }
  const mappings: ActivityMapping[] = (mappingRows ?? []).map((m: { flostruction_category: string; myob_activity_id: string }) => ({
    flostruction_category: m.flostruction_category as string,
    myob_activity_id: m.myob_activity_id as string,
  }));

  // Fetch worker myob_card_id values, tenant-scoped, for the workers
  // present in the shift set.
  const workerIds = Array.from(new Set(shifts.map((s) => s.worker_id))).filter(
    Boolean,
  );
  let workerCardIndex = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: workerRows, error: workerErr } = await supabase
      .from('workers')
      .select('id, myob_card_id')
      .eq('company_id', companyId)
      .in('id', workerIds);
    if (workerErr) {
      log.error({ err: workerErr.message }, 'exports.myob.workers_fetch_failed');
      return NextResponse.json(
        { error: 'Failed to fetch worker card IDs' },
        { status: 500 },
      );
    }
    workerCardIndex = new Map(
      (workerRows ?? []).map((w: { id: string; myob_card_id: string | null }) => [
        w.id as string,
        (w.myob_card_id as string | null) ?? '',
      ]),
    );
  }

  // Project ApprovedShift → MyobShift. Per the substrate-DD finding
  // in the file header: every shift currently exports as
  // 'ordinary_hours'. Per-shift category breakdown is Phase-2 work.
  const myobShifts: MyobShift[] = shifts.map((s) => ({
    card_id: workerCardIndex.get(s.worker_id) ?? '',
    shift_date: s.shift_date,
    category: 'ordinary_hours',
    units: s.total_hours,
    job: s.site_name,
    ...(s.notes ? { notes: s.notes } : {}),
    ...(s.start_time ? { start_time: s.start_time } : {}),
    ...(s.end_time ? { stop_time: s.end_time } : {}),
  }));

  const exporter = new MYOBExporter();
  let result;
  try {
    result = exporter.format(myobShifts, mappings);
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'exports.myob.format_failed',
    );
    return NextResponse.json(
      { error: 'Format failed', details: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }

  log.info(
    {
      companyId,
      pay_period_start,
      pay_period_end,
      shift_count: shifts.length,
      row_count: result.rowCount,
      warning_count: result.warnings.length,
    },
    'exports.myob.success',
  );

  return NextResponse.json({
    content: result.body,
    filename: buildFileName(pay_period_start, pay_period_end),
    row_count: result.rowCount,
    warnings: result.warnings,
  });
}
