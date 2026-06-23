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
// W1.3 part B (2026-06-10): all DB access flows through scoped
// repositories; the atomic write RPC is reached via the exports repo.
import {
  shiftsRepo,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';
import { workersRepo } from '@/lib/db/repositories/workers.repo';
import { exportsRepo, tenantActivityMappingsRepo } from '@/lib/db/repositories/exports.repo';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildExportRecord } from '@/lib/wles/v1-translate';
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

/** Map worker_id → that worker's `ordinary_hours` Activity ID from the
 *  per-worker `workers.activity_mappings`. Returns an empty map (not an
 *  error) when nothing is set — the export then falls back to the company
 *  mappings, preserving the pre-per-worker behaviour. A fetch error is
 *  logged and treated as "no per-worker codes" rather than failing the
 *  export: the worker-card and category resolution still produce a valid
 *  file, and a missing premium code is a softer failure than a blocked run. */
async function loadWorkerOrdinaryActivityIds(
  wRepo: ReturnType<typeof workersRepo>,
  workerIds: string[],
  log: ReturnType<typeof routeLogger>,
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  if (workerIds.length === 0) return index;
  const { data, error } = await wRepo.listActivityMappings(workerIds);
  if (error) {
    log.warn({ err: error.message }, 'exports.myob.activity_mappings_fetch_failed');
    return index;
  }
  for (const w of (data ?? []) as Array<{
    id: string;
    activity_mappings: Record<string, string> | null;
  }>) {
    const code = w.activity_mappings?.ordinary_hours?.trim();
    if (code) index.set(w.id, code);
  }
  return index;
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
  // CRACK 229: also pull `employee_id` so the route can fall back from
  // `workers.myob_card_id` (often null for tenants who haven't run their
  // first MYOB export yet) to the canonical FLOSTRUCTION worker id —
  // matches the dispatch oracle which uses `EMP-FLOSMOSIS-TEST-JOAO`.
  workers: {
    id: string;
    first_name: string;
    last_name: string;
    employee_id: string;
    pay_rate: string;
  } | null;
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

  // Scoped repositories (W1.3 part B). tenant_activity_mappings binds
  // tenant_id = companyId (FK to companies.id, founder-pinned).
  const repo = shiftsRepo(companyId);
  const tamRepo = tenantActivityMappingsRepo(companyId);
  const wRepo = workersRepo(companyId);
  const expRepo = exportsRepo(companyId);

  // Fetch shifts for CSV generation and basic pre-flight validation.
  const { data: shiftRows, error: shiftFetchErr } = await repo.listForMyobExport(shift_ids);

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

  // Fetch activity mappings (tenant-scoped via the repo binding).
  const { data: mappingRows, error: mappingErr } = await tamRepo.listMyobActivityMappings();
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

  // Fetch worker myob_card_ids. CRACK 229: also include employee_id as the
  // canonical FLOSTRUCTION-side fallback — production workers are
  // provisioned without a myob_card_id until the bookkeeper runs the
  // first MYOB export, but the employee_id is always present.
  const workerIds = Array.from(new Set(rows.map((r) => r.worker_id))).filter(Boolean) as string[];
  let workerCardIndex = new Map<string, string>();
  if (workerIds.length > 0) {
    const { data: workerRows, error: workerErr } = await wRepo.listMyobCardsWithEmployeeIds(workerIds);
    if (workerErr) {
      log.error({ err: workerErr.message }, 'exports.myob.workers_fetch_failed');
      return NextResponse.json({ error: 'Failed to fetch worker card IDs' }, { status: 500 });
    }
    workerCardIndex = new Map(
      (workerRows ?? []).map(
        (w: { id: string; myob_card_id: string | null; employee_id: string | null }) => [
          w.id as string,
          (w.myob_card_id as string | null)?.trim() ||
            (w.employee_id as string | null)?.trim() ||
            '',
        ],
      ),
    );
  }

  // Per-worker payroll activity IDs. Each shift exports as 'ordinary_hours'
  // (see SUBSTRATE-DD note below), so the worker's `ordinary_hours` Activity
  // ID is the code that applies. When a worker has none, activity_id stays
  // empty and the exporter falls through to the company mappings → LABOUR
  // default — fully backward-compatible with tenants who never set one.
  const workerActivityIndex = await loadWorkerOrdinaryActivityIds(wRepo, workerIds, log);

  // SUBSTRATE-DD FINDING: FLOSTRUCTION captures only total_hours per shift,
  // not per-category breakdowns. Every shift is emitted as 'ordinary_hours'.
  // Mo's bookkeeper adds overtime/allowance breakdowns in MYOB post-import.
  // See original route comment (CRACK 217) for the three architecture options.
  //
  // CRACK 229: drop the Job/Notes/Start Time/Stop Time optional columns so
  // the bookkeeper sees a clean 4-column TSV matching the prior CSV import
  // shape they use. Those fields stay in the substrate (chain, audit-trail,
  // /field/records) but don't surface in the export — Lauren's call per the
  // 2026-05-11 PM dispatch oracle.
  const myobShifts: MyobShift[] = rows.map((s) => {
    const workerActivityId = workerActivityIndex.get(s.worker_id ?? '');
    return {
      card_id: workerCardIndex.get(s.worker_id ?? '') ?? '',
      shift_date: s.shift_date,
      category: 'ordinary_hours',
      units: parseFloat(s.total_hours ?? '0'),
      ...(workerActivityId ? { activity_id: workerActivityId } : {}),
    };
  });

  const exporter = new MYOBExporter();
  let result: { body: string; rowCount: number; warnings: Array<{ reason: string; shiftId?: string }> };
  try {
    // CRACK 229 oracle options — see MyobFormatOptions docstring for the
    // rationale on each. defaultActivityId='LABOUR' is the FLOSTRUCTION-
    // canonical fallback until the per-tenant activity-mapping admin
    // surface ships and Mo's bookkeeper populates `tenant_activity_mappings`.
    result = exporter.format(myobShifts, mappings, {
      includeMarker: false,
      dateFormat: 'YYYY-MM-DD',
      defaultActivityId: 'LABOUR',
    });
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
  const shiftDates = rows.map((r) => r.shift_date).sort();
  const payPeriodStart = shiftDates[0];
  const payPeriodEnd = shiftDates[shiftDates.length - 1];
  const filename = buildFileName(payPeriodStart, payPeriodEnd);

  // EXPORT_RECORD persistence.
  //
  // Under WLES v1 the events are sealed in TS (buildExportRecord →
  // sealEvent → insertV1, substrate event_type 'EXPORT_RECORD' via
  // eventTypeForSubstrate) chained off the per-company v1 tail — the same
  // path /api/command/export uses, validated end-to-end by the live João
  // run (2026-06-16). The legacy v0 RPC seals in PL/pgSQL with spec='0',
  // which shift_events_post_cutover_spec_v1 forbids, so it is the
  // else-branch only.
  //
  // Atomicity note: the v1 path mirrors command/export's per-shift loop
  // rather than the single-transaction RPC. Chain correctness is preserved
  // because each EXPORT_RECORD re-reads the v1 tail and chains sequentially
  // (no shared previous_event_hash, the bug CRACK 219 fixed for v0). A
  // fully-atomic pre-sealed-rows RPC is tracked as CRACK 220.
  let exportId: string;
  let eventCount = 0;

  if (isWlesV1Enabled()) {
    const mutRepo = shiftsMutationRepo(companyId);
    const evRepo = shiftEventsMutationRepo(companyId);
    const totalHours = rows.reduce((sum, r) => sum + parseFloat(r.total_hours ?? '0'), 0);

    const { data: exportRecord, error: exportErr } = await expRepo.insertExport({
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      export_target: 'myob',
      shift_ids,
      total_shifts: rows.length,
      total_hours: totalHours.toFixed(2),
      file_hash: fileHash,
      exported_by: userId,
      exported_at: now.toISOString(),
    });
    if (exportErr || !exportRecord) {
      log.error({ err: exportErr?.message, companyId }, 'exports.myob.v1.export_insert_failed');
      return NextResponse.json({ error: 'Export pipeline failed' }, { status: 500 });
    }
    exportId = (exportRecord as { id: string }).id;

    for (const r of rows) {
      if (!r.worker_id || !r.company_id) continue;
      const eventData = {
        shift_id: r.id,
        receipt_id: r.receipt_id,
        export_id: exportId,
        provider: 'myob',
        file_hash: fileHash,
      };
      try {
        const previousEventHash = await evRepo.v1ChainTail();
        const sealed = sealEvent(
          buildExportRecord({
            actorId: userId,
            subjectId: r.worker_id,
            timestamp: now.toISOString(),
            previousEventHash,
            shiftId: r.id,
            exportId,
            provider: 'myob',
            fileHash,
          }),
        );
        await evRepo.insertV1(sealed, {
          companyId: r.company_id,
          workerId: r.worker_id,
          siteId: r.site_id ?? null,
          createdBy: userId,
          eventTypeForSubstrate: 'EXPORT_RECORD',
          eventDataCompat: eventData,
        });
        eventCount++;
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : String(err), shiftId: r.id },
          'exports.myob.v1.export_record_failed',
        );
        return NextResponse.json(
          { error: 'Export pipeline failed', detail: 'Could not seal export record' },
          { status: 500 },
        );
      }
      const { error: markErr } = await mutRepo.markExported(r.id, exportId, now.toISOString());
      if (markErr) {
        log.error({ err: markErr.message, shiftId: r.id }, 'exports.myob.v1.mark_exported_failed');
        return NextResponse.json(
          { error: 'Export pipeline failed', detail: 'Could not mark shift exported' },
          { status: 500 },
        );
      }
    }
  } else {
    // v0 — atomic PL/pgSQL RPC (CRACK 219): INSERT exports + UPDATE shifts +
    // INSERT EXPORT_RECORD (spec='0') with per-worker chain linkage.
    const { data: rpcRows, error: rpcErr } = await expRepo.processFlostructionExport({
      adminUserId: userId,
      shiftIds: shift_ids,
      fileHash,
    });

    if (rpcErr) {
      const msg = rpcErr.message ?? '';
      log.error({ err: msg, companyId }, 'exports.myob.rpc_failed');
      if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
      if (msg.startsWith('INVALID_SHIFTS')) return NextResponse.json({ error: msg }, { status: 422 });
      if (msg.startsWith('RACE_CONDITION')) return NextResponse.json({ error: msg }, { status: 409 });
      if (msg.startsWith('EMPTY_INPUT')) return NextResponse.json({ error: msg }, { status: 400 });
      return NextResponse.json({ error: 'Export pipeline failed', detail: msg }, { status: 500 });
    }

    const rpcResult = (rpcRows as unknown as ExportRpcRow[])?.[0];
    if (!rpcResult?.export_id) {
      log.error({ companyId }, 'exports.myob.rpc_no_result');
      return NextResponse.json({ error: 'Export pipeline returned no result' }, { status: 500 });
    }
    exportId = rpcResult.export_id;
    eventCount = rpcResult.event_count;
  }

  log.info(
    {
      companyId,
      exportId,
      shift_count: rows.length,
      event_count: eventCount,
      row_count: result.rowCount,
      warning_count: result.warnings.length,
      spec: isWlesV1Enabled() ? '1.0' : '0',
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

  // Scoped repositories (W1.3 part B) — see handleFullPipeline note.
  const tamRepo = tenantActivityMappingsRepo(companyId);
  const wRepo = workersRepo(companyId);

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

  const { data: mappingRows, error: mappingErr } = await tamRepo.listMyobActivityMappings();
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
    const { data: workerRows, error: workerErr } = await wRepo.listMyobCards(workerIds);
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

  // Per-worker payroll activity IDs (see handleFullPipeline for rationale).
  const workerActivityIndex = await loadWorkerOrdinaryActivityIds(
    wRepo,
    workerIds.filter((id): id is string => Boolean(id)),
    log,
  );

  const myobShifts: MyobShift[] = shifts.map((s) => {
    const workerActivityId = workerActivityIndex.get(s.worker_id);
    return {
      card_id: workerCardIndex.get(s.worker_id) ?? '',
      shift_date: s.shift_date,
      category: 'ordinary_hours',
      units: s.total_hours,
      job: s.site_name,
      ...(workerActivityId ? { activity_id: workerActivityId } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      ...(s.start_time ? { start_time: s.start_time } : {}),
      ...(s.end_time ? { stop_time: s.end_time } : {}),
    };
  });

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
