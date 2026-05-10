// ─────────────────────────────────────────────────────────────────
// /api/exports/myob — MYOB AccountRight timesheet export
// ─────────────────────────────────────────────────────────────────
//
// Authored:  Cowork Monday 5 May 2026 (feature/myob-exporter branch)
// For:       Mo (Dass Labour Hire) Mon 12 May pay run
// Method:    POST
//
// TWO REQUEST SHAPES:
//
// Shape A — FULL PIPELINE (CRACK 217, production path):
//   Body: { shift_ids: string[] }
//   Validates shifts are all PAYROLL_APPROVED, generates CSV,
//   records exports row, transitions shifts to EXPORTED, inserts
//   one EXPORT_RECORD WLES event per shift, returns CSV as attachment.
//
// Shape B — LEGACY / TEST path (original behaviour, kept for compat):
//   Body: { pay_period_start: 'YYYY-MM-DD', pay_period_end: 'YYYY-MM-DD' }
//   Returns JSON { content, filename, row_count, warnings }.
//   Does NOT transition shifts or write to exports table.
//   Kept because existing test coverage exercises this path extensively.
//
// SCOPE — what this route DOES (Shape A, full pipeline)
//
// 1. Authenticates via getCompanyIdForSession() (same pattern as
//    /api/command/export — the canonical Class-A admin route auth).
// 2. Fetches and validates the requested shift IDs (must all be
//    PAYROLL_APPROVED for the tenant, returns 422 otherwise).
// 3. Fetches worker myob_card_id values.
// 4. Fetches activity mappings.
// 5. Generates CSV via MYOBExporter.
// 6. Computes SHA-256 file_hash of the CSV body.
// 7. INSERTs one row into the exports table.
// 8. UPDATEs shifts SET status = 'EXPORTED'.
// 9. INSERTs one EXPORT_RECORD shift_event per shift, chaining off
//    the most-recent prior event for that worker (chain integrity).
// 10. Returns the CSV as Content-Disposition: attachment.
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

import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { getApprovedShifts } from '@/lib/export/get-approved-shifts';
import { generateEventHash } from '@/lib/wles/hash';
import {
  MYOBExporter,
  type ActivityMapping,
  type MyobShift,
} from '@/lib/exporters/myob';

// AEST-aware filename generation; matches the existing
// /api/command/export pattern but with the .txt extension MYOB
// requires (NOT .csv).
function buildFileName(start: string, end: string): string {
  return `Flostruction_MYOB_${start}_to_${end}.txt`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Shape A — full pipeline (shift_ids) ─────────────────────────

interface FullPipelineBody {
  shift_ids: string[];
}

interface ShiftRowFull {
  id: string;
  company_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  worker_note: string | null;
  workers: { id: string; first_name: string; last_name: string; employee_id: string; pay_rate: string } | null;
  sites: { id: string; name: string } | null;
}

async function handleFullPipeline(
  request: Request,
  body: FullPipelineBody,
): Promise<Response> {
  const log = routeLogger(
    'POST /api/exports/myob [pipeline]',
    request.headers.get('x-request-id'),
  );

  let userId: string;
  let companyId: string;
  try {
    ({ userId, companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const ip = getClientIP(request);
  const rl = checkRateLimit(`exports.myob:${ip}`, RATE_LIMITS.EXPORT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { shift_ids } = body;
  if (!Array.isArray(shift_ids) || shift_ids.length === 0) {
    return NextResponse.json(
      { error: 'shift_ids must be a non-empty array of UUIDs' },
      { status: 400 },
    );
  }
  if (shift_ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return NextResponse.json(
      { error: 'shift_ids contains invalid UUID(s)' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Fetch the requested shifts (tenant-scoped).
  const { data: shiftRows, error: shiftFetchErr } = await supabase
    .from('shifts')
    .select(`
      id, company_id, worker_id, site_id,
      shift_date, start_time, end_time,
      break_minutes, total_hours, status,
      receipt_id, worker_note,
      workers(id, first_name, last_name, employee_id, pay_rate),
      sites(id, name)
    `)
    .eq('company_id', companyId)
    .in('id', shift_ids);

  if (shiftFetchErr) {
    log.error({ err: shiftFetchErr.message }, 'exports.myob.shifts_fetch_failed');
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }

  const rows = (shiftRows ?? []) as unknown as ShiftRowFull[];

  // Confirm all requested IDs exist in this tenant.
  const foundIds = new Set(rows.map((r) => r.id));
  const missingIds = shift_ids.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: 'Shift(s) not found in tenant', shift_ids: missingIds },
      { status: 404 },
    );
  }

  // Idempotency: if every requested shift is already EXPORTED this export
  // already ran successfully. Return early without re-processing.
  if (rows.every((r) => r.status === 'EXPORTED')) {
    log.info({ companyId, shiftCount: rows.length }, 'exports.myob.pipeline.idempotent_replay');
    return NextResponse.json({ ok: true, already_exported: true }, { status: 200 });
  }

  // Validate every shift is PAYROLL_APPROVED.
  const nonApproved = rows.filter((r) => r.status !== 'PAYROLL_APPROVED');
  if (nonApproved.length > 0) {
    return NextResponse.json(
      {
        error: 'All selected shifts must have status PAYROLL_APPROVED',
        invalid_ids: nonApproved.map((r) => ({ id: r.id, status: r.status })),
      },
      { status: 422 },
    );
  }

  // Fetch activity mappings.
  const { data: mappingRows, error: mappingErr } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id')
    .eq('tenant_id', companyId);
  if (mappingErr) {
    log.error({ err: mappingErr.message }, 'exports.myob.mappings_fetch_failed');
    return NextResponse.json({ error: 'Failed to fetch activity mappings' }, { status: 500 });
  }
  const mappings: ActivityMapping[] = (mappingRows ?? []).map(
    (m: { flostruction_category: string; myob_activity_id: string }) => ({
      flostruction_category: m.flostruction_category,
      myob_activity_id: m.myob_activity_id,
    }),
  );

  // Fetch worker myob_card_ids.
  const workerIds = Array.from(new Set(rows.map((r) => r.worker_id))).filter(Boolean) as string[];
  let workerCardIndex = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: workerRows, error: workerErr } = await supabase
      .from('workers')
      .select('id, myob_card_id')
      .eq('company_id', companyId)
      .in('id', workerIds);
    if (workerErr) {
      log.error({ err: workerErr.message }, 'exports.myob.workers_fetch_failed');
      return NextResponse.json({ error: 'Failed to fetch worker card IDs' }, { status: 500 });
    }
    workerCardIndex = new Map(
      (workerRows ?? []).map((w: { id: string; myob_card_id: string | null }) => [
        w.id as string,
        (w.myob_card_id as string | null) ?? '',
      ]),
    );
  }

  // Project to MyobShift and format CSV.
  const myobShifts: MyobShift[] = rows.map((s) => ({
    card_id: workerCardIndex.get(s.worker_id ?? '') ?? '',
    shift_date: s.shift_date,
    category: 'ordinary_hours',
    units: parseFloat(s.total_hours ?? '0'),
    job: s.sites?.name ?? '',
    ...(s.worker_note ? { notes: s.worker_note } : {}),
    ...(s.start_time ? { start_time: s.start_time } : {}),
    ...(s.end_time ? { stop_time: s.end_time } : {}),
  }));

  const exporter = new MYOBExporter();
  let result: { body: string; rowCount: number; warnings: Array<{ reason: string; shiftId?: string }> };
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

  const fileHash = createHash('sha256').update(result.body).digest('hex');
  const now = new Date();

  // Derive pay period from shift dates.
  const shiftDates = rows.map((r) => r.shift_date).sort();
  const payPeriodStart = shiftDates[0];
  const payPeriodEnd = shiftDates[shiftDates.length - 1];

  const totalHours = rows.reduce(
    (sum, r) => sum + parseFloat(r.total_hours ?? '0'),
    0,
  );

  // INSERT into exports table.
  const { data: exportRow, error: exportInsertErr } = await supabase
    .from('exports')
    .insert({
      company_id: companyId,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      export_target: 'myob',
      shift_ids: shift_ids,
      total_shifts: shift_ids.length,
      total_hours: totalHours.toFixed(2),
      file_hash: fileHash,
      exported_by: userId,
      exported_at: now.toISOString(),
    })
    .select('id')
    .single();

  if (exportInsertErr) {
    log.error({ err: exportInsertErr.message }, 'exports.myob.exports_insert_failed');
    return NextResponse.json({ error: 'Failed to record export' }, { status: 500 });
  }

  const exportId = (exportRow as { id: string }).id;

  // UPDATE shifts to EXPORTED. Optimistic-lock on PAYROLL_APPROVED to
  // prevent a double-export race from silently succeeding.
  const { error: shiftUpdateErr } = await supabase
    .from('shifts')
    .update({ status: 'EXPORTED', export_id: exportId, updated_at: now.toISOString() })
    .in('id', shift_ids)
    .eq('company_id', companyId)
    .eq('status', 'PAYROLL_APPROVED');

  if (shiftUpdateErr) {
    log.error({ err: shiftUpdateErr.message }, 'exports.myob.shift_update_failed');
    // Non-fatal: exports row committed; shifts update recoverable by re-run.
  }

  // INSERT one EXPORT_RECORD shift_event per shift.
  // Fetch the most-recent prior event per unique worker (avoid N+1 across
  // shifts that share the same worker_id).
  const uniqueWorkerIds = Array.from(new Set(rows.map((r) => r.worker_id).filter(Boolean))) as string[];
  const lastEventByWorker = new Map<string, { id: string; event_hash: string }>();

  for (const wid of uniqueWorkerIds) {
    const { data: lastEvt } = await supabase
      .from('shift_events')
      .select('id, event_hash')
      .eq('worker_id', wid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastEvt) {
      lastEventByWorker.set(wid, lastEvt as { id: string; event_hash: string });
    }
  }

  for (const shift of rows) {
    const workerId = shift.worker_id ?? '';
    const siteId = shift.site_id ?? '';
    const shiftCompanyId = shift.company_id ?? companyId;
    const prior = lastEventByWorker.get(workerId);

    const eventData: Record<string, unknown> = {
      shift_id: shift.id,
      receipt_id: shift.receipt_id,
      export_id: exportId,
      provider: 'myob',
      file_hash: fileHash,
    };

    const eventHash = generateEventHash({
      company_id: shiftCompanyId,
      worker_id: workerId,
      site_id: siteId,
      event_type: 'EXPORT_RECORD',
      event_data: eventData,
      created_at: now,
    });

    const { error: evtErr } = await supabase.from('shift_events').insert({
      company_id: shiftCompanyId,
      worker_id: workerId,
      site_id: siteId,
      event_type: 'EXPORT_RECORD',
      event_data: eventData,
      device_metadata: {},
      event_hash: eventHash,
      previous_event_hash: prior?.event_hash ?? null,
      parent_shift_event_id: prior?.id ?? null,
      spec_version: '0',
      created_at: now.toISOString(),
      created_by: userId,
    });

    if (evtErr) {
      log.error(
        { err: evtErr.message, shiftId: shift.id },
        'exports.myob.event_insert_failed',
      );
      // Compensating rollback: undo the exports insert and shift status updates.
      // shift_events for preceding shifts in this batch remain (harmless breadcrumbs).
      await Promise.allSettled([
        supabase.from('exports').delete().eq('id', exportId),
        supabase
          .from('shifts')
          .update({ status: 'PAYROLL_APPROVED', export_id: null, updated_at: now.toISOString() })
          .in('id', shift_ids)
          .eq('company_id', companyId),
      ]);
      return NextResponse.json(
        { error: 'Event chain write failed; export rolled back', shift_id: shift.id },
        { status: 500 },
      );
    }

    // Advance the chain head for this worker so subsequent shifts in the
    // same batch don't all point to the same prior event.
    lastEventByWorker.set(workerId, { id: shift.id + '-export', event_hash: eventHash });
  }

  const filename = buildFileName(payPeriodStart, payPeriodEnd);

  log.info(
    {
      companyId,
      exportId,
      shift_count: rows.length,
      row_count: result.rowCount,
      warning_count: result.warnings.length,
    },
    'exports.myob.pipeline.success',
  );

  return new Response(result.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Export-Id': exportId,
      'X-Row-Count': String(result.rowCount),
      'X-Warning-Count': String(result.warnings.length),
    },
  });
}

// ─── Shape B — legacy path (pay_period_start/pay_period_end) ─────

interface LegacyBody {
  pay_period_start?: string;
  pay_period_end?: string;
}

async function handleLegacy(request: Request, body: LegacyBody): Promise<Response> {
  const log = routeLogger(
    'POST /api/exports/myob',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const ip = getClientIP(request);
  const rl = checkRateLimit(`exports.myob:${ip}`, RATE_LIMITS.EXPORT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { pay_period_start, pay_period_end } = body;
  if (!pay_period_start || !pay_period_end) {
    return NextResponse.json(
      { error: 'pay_period_start and pay_period_end (YYYY-MM-DD) required' },
      { status: 400 },
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(pay_period_start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(pay_period_end)
  ) {
    return NextResponse.json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
  }

  const supabase = createServiceClient();

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
    return NextResponse.json({ error: 'Failed to fetch approved shifts' }, { status: 500 });
  }

  const { data: mappingRows, error: mappingErr } = await supabase
    .from('tenant_activity_mappings')
    .select('flostruction_category, myob_activity_id')
    .eq('tenant_id', companyId);
  if (mappingErr) {
    log.error({ err: mappingErr.message }, 'exports.myob.mappings_fetch_failed');
    return NextResponse.json({ error: 'Failed to fetch activity mappings' }, { status: 500 });
  }
  const mappings: ActivityMapping[] = (mappingRows ?? []).map(
    (m: { flostruction_category: string; myob_activity_id: string }) => ({
      flostruction_category: m.flostruction_category,
      myob_activity_id: m.myob_activity_id,
    }),
  );

  const workerIds = Array.from(new Set(shifts.map((s) => s.worker_id))).filter(Boolean);
  let workerCardIndex = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: workerRows, error: workerErr } = await supabase
      .from('workers')
      .select('id, myob_card_id')
      .eq('company_id', companyId)
      .in('id', workerIds);
    if (workerErr) {
      log.error({ err: workerErr.message }, 'exports.myob.workers_fetch_failed');
      return NextResponse.json({ error: 'Failed to fetch worker card IDs' }, { status: 500 });
    }
    workerCardIndex = new Map(
      (workerRows ?? []).map((w: { id: string; myob_card_id: string | null }) => [
        w.id as string,
        (w.myob_card_id as string | null) ?? '',
      ]),
    );
  }

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

// ─── Entry point ─────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (Array.isArray(body.shift_ids)) {
    return handleFullPipeline(request, body as unknown as FullPipelineBody);
  }
  return handleLegacy(request, body as LegacyBody);
}
