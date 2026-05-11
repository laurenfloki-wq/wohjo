// ─────────────────────────────────────────────────────────────────
// /api/exports/myob — MYOB AccountRight timesheet export
// ─────────────────────────────────────────────────────────────────
//
// TWO REQUEST SHAPES:
//
// Shape A — FULL PIPELINE (CRACK 217/219, production path):
//   Body: { shift_ids: string[] }
//   Generates CSV, calls process_flostruction_export RPC (atomic:
//   records exports row + transitions shifts + inserts EXPORT_RECORD
//   WLES events with correct chain linkage), returns CSV as attachment.
//
//   CRACK 219 fix: all DB writes happen inside the PL/pgSQL RPC as a
//   single transaction.  The old multi-call pattern had two bugs:
//     Bug #1 — compensating rollback attempted EXPORTED→PAYROLL_APPROVED
//              which the state-machine trigger blocks (EXPORTED is terminal).
//     Bug #2 — all shifts for the same worker shared the same
//              previous_event_hash (pre-batch head), causing the chain
//              validation trigger to reject shifts 2..N.
//   Both bugs are eliminated by the RPC's sequential per-iteration
//   chain re-read from a temp table.
//
// Shape B — LEGACY / TEST path (original behaviour, kept for compat):
//   Body: { pay_period_start: 'YYYY-MM-DD', pay_period_end: 'YYYY-MM-DD' }
//   Returns JSON { content, filename, row_count, warnings }.
//   Does NOT transition shifts or write to exports table.

import { createHash } from 'crypto';
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

interface ExportRpcRow {
  export_id: string;
  exported_shifts: string[];
  event_count: number;
  export_record_event_ids: string[];
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

  // Fetch shifts for CSV generation and basic pre-flight validation.
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

  const foundIds = new Set(rows.map((r) => r.id));
  const missingIds = shift_ids.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: 'Shift(s) not found in tenant', shift_ids: missingIds },
      { status: 404 },
    );
  }

  // Idempotency: all shifts already EXPORTED → this export already ran.
  if (rows.every((r) => r.status === 'EXPORTED')) {
    log.info({ companyId, shiftCount: rows.length }, 'exports.myob.pipeline.idempotent_replay');
    return NextResponse.json({ ok: true, already_exported: true }, { status: 200 });
  }

  // Pre-flight: all must be PAYROLL_APPROVED before we generate the CSV.
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

  // SUBSTRATE-DD FINDING: FLOSTRUCTION captures only total_hours per shift,
  // not per-category breakdowns. Every shift is emitted as 'ordinary_hours'.
  // Mo's bookkeeper adds overtime/allowance breakdowns in MYOB post-import.
  // See original route comment (CRACK 217) for the three architecture options.
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

  // Hand off all DB writes to the atomic RPC.
  // process_flostruction_export handles: INSERT exports, UPDATE shifts,
  // INSERT EXPORT_RECORD events with correct per-worker chain linkage.
  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    'process_flostruction_export',
    {
      p_company_id:    companyId,
      p_admin_user_id: userId,
      p_shift_ids:     shift_ids,
      p_file_hash:     fileHash,
    },
  );

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    log.error({ err: msg, companyId }, 'exports.myob.rpc_failed');

    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    if (msg.startsWith('INVALID_SHIFTS')) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    if (msg.startsWith('RACE_CONDITION')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg.startsWith('EMPTY_INPUT')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'Export pipeline failed', detail: msg }, { status: 500 });
  }

  const rpcResult = ((rpcRows as unknown) as ExportRpcRow[])?.[0];
  if (!rpcResult?.export_id) {
    log.error({ companyId }, 'exports.myob.rpc_no_result');
    return NextResponse.json({ error: 'Export pipeline returned no result' }, { status: 500 });
  }

  const shiftDates = rows.map((r) => r.shift_date).sort();
  const payPeriodStart = shiftDates[0];
  const payPeriodEnd = shiftDates[shiftDates.length - 1];
  const filename = buildFileName(payPeriodStart, payPeriodEnd);

  log.info(
    {
      companyId,
      exportId: rpcResult.export_id,
      shift_count: rows.length,
      event_count: rpcResult.event_count,
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
      'X-Export-Id': rpcResult.export_id,
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
