// CRACK 232 — POST /api/admin/workers/bulk-upload
//
// Admin-only bulk worker creation from CSV upload. Accepts
// multipart/form-data with a single field `file` containing the CSV
// body (or `application/json` body { csv: string } for programmatic
// callers). Each row produces a worker + a WORKER_CREATED shift_event
// in a single atomic transaction via the bulk_create_workers RPC.
//
// CSV columns (header MUST match verbatim):
//   employee_id,full_name,mobile_e164,myob_card_id
//
// Validation (route layer, pre-RPC):
//   - Header exact match
//   - employee_id non-empty
//   - full_name non-empty (split on first space → first_name + last_name;
//     single-name rows go in as first_name="...", last_name="-")
//   - mobile_e164 matches /^\+61[0-9]{9}$/ (strict AU mobile per dispatch)
//   - myob_card_id optional, empty string → null
//   - No duplicate (employee_id) or (mobile_e164) rows in the same upload
//
// RPC-layer rejections (mapped to HTTP):
//   FORBIDDEN              → 403
//   DUPLICATE_EMPLOYEE_ID  → 409
//   DUPLICATE_PHONE        → 409
//   INVALID_PHONE_FORMAT   → 400 (defense-in-depth; route catches first)
//   EMPTY_INPUT            → 400
//
// Body size: 1MB cap (≈10,000 workers) — well above founding-cohort scale.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { parseBulkWorkerCsv, type ParsedWorker } from '@/lib/bulk-worker-csv';
import { isWlesV1Enabled, isWlesTypeRegistryLocked } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildWorkerCreated } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';

export const runtime = 'nodejs';

const MAX_CSV_BYTES = 1_048_576; // 1 MB
const MAX_ROWS = 10_000;

async function readCsvFromRequest(
  request: Request,
): Promise<{ csv: string } | { error: string; status: number }> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.startsWith('application/json')) {
    let body: { csv?: unknown };
    try {
      body = (await request.json()) as { csv?: unknown };
    } catch {
      return { error: 'Invalid JSON payload', status: 400 };
    }
    if (typeof body.csv !== 'string') {
      return { error: 'csv (string) required in body', status: 400 };
    }
    if (body.csv.length > MAX_CSV_BYTES) {
      return { error: `CSV too large (max ${MAX_CSV_BYTES} bytes).`, status: 413 };
    }
    return { csv: body.csv };
  }

  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { error: 'Invalid multipart payload', status: 400 };
    }
    const file = form.get('file');
    if (!file || !(file instanceof Blob)) {
      return { error: 'multipart field "file" (CSV) is required', status: 400 };
    }
    if (file.size > MAX_CSV_BYTES) {
      return { error: `CSV too large (max ${MAX_CSV_BYTES} bytes).`, status: 413 };
    }
    const csv = await file.text();
    return { csv };
  }

  return {
    error: 'Content-Type must be application/json or multipart/form-data',
    status: 415,
  };
}

export async function POST(request: Request): Promise<Response> {
  const log = routeLogger(
    'POST /api/admin/workers/bulk-upload',
    request.headers.get('x-request-id'),
  );
  log.info({}, 'request.received');

  // Rate limit — bulk uploads are expensive. 10 per hour per IP.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`admin.bulk_worker_upload:${ip}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in an hour.' },
      { status: 429 },
    );
  }

  // Auth (also returns the admin user_id required by the RPC).
  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // Read CSV from JSON or multipart.
  const readResult = await readCsvFromRequest(request);
  if ('error' in readResult) {
    return NextResponse.json({ error: readResult.error }, { status: readResult.status });
  }
  const { csv } = readResult;

  // Parse + validate.
  const { rows, errors } = parseBulkWorkerCsv(csv);
  if (errors.length > 0) {
    log.warn({ errorCount: errors.length }, 'admin.bulk_worker_upload.parse_errors');
    return NextResponse.json(
      {
        created_count: 0,
        failed_rows: errors,
        message: 'CSV parse errors. No workers created (atomic).',
      },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json(
      { created_count: 0, failed_rows: [], message: 'CSV contained no data rows.' },
      { status: 400 },
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${rows.length}). Max ${MAX_ROWS} per upload.` },
      { status: 413 },
    );
  }

  // Hand off to the atomic RPC.
  const supabase = createServiceClient();
  const { data: rpcRows, error: rpcErr } = await supabase.rpc('bulk_create_workers', {
    p_company_id: companyId,
    p_admin_user_id: userId,
    p_workers: rows.map((r) => ({
      employee_id: r.employee_id,
      first_name: r.first_name,
      last_name: r.last_name,
      phone: r.phone,
      myob_card_id: r.myob_card_id,
    })),
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? '';
    log.error({ err: msg, companyId }, 'admin.bulk_worker_upload.rpc_failed');

    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: 'FORBIDDEN', message: msg }, { status: 403 });
    }
    if (msg.startsWith('DUPLICATE_EMPLOYEE_ID') || msg.startsWith('DUPLICATE_PHONE')) {
      return NextResponse.json(
        { error: msg, created_count: 0, message: 'No workers created (atomic).' },
        { status: 409 },
      );
    }
    if (msg.startsWith('INVALID_PHONE_FORMAT') || msg.startsWith('EMPTY_INPUT')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'Bulk worker upload failed', detail: msg }, { status: 500 });
  }

  // RPC returns RETURNS TABLE columns prefixed with out_ to avoid
  // PL/pgSQL ambiguity with the workers table columns. Normalise back
  // to the API contract names here.
  const rawRows =
    (rpcRows as unknown as Array<{
      out_worker_id: string;
      out_employee_id: string;
      out_phone: string;
    }>) ?? [];
  const created = rawRows.map((r) => ({
    worker_id: r.out_worker_id,
    employee_id: r.out_employee_id,
    phone: r.out_phone,
  }));

  // ─── M1-recon-F: mint WORKER_CREATED v1 events from the route ───
  // The RPC used to do this in PL/pgSQL with spec_version='0' +
  // previous_event_hash=NULL — post-cutover the substrate rejects
  // that shape. Sealing now lives where every other v1 path lives.
  //
  // Type-registry gate: until WLES_TYPE_REGISTRY_LOCKED=true is set,
  // the route returns 201 with the workers created but flags
  // event_sealing_pending so the caller knows the WORKER_CREATED
  // shift_events row hasn't been minted. This is the
  // "no provisional string" guarantee from the substrate review.
  let eventsMinted = 0;
  const sealingErrors: Array<{ worker_id: string; error: string }> = [];
  let eventSealingPending = false;

  if (!isWlesTypeRegistryLocked()) {
    eventSealingPending = true;
    log.warn(
      { companyId, created_count: created.length },
      'admin.bulk_worker_upload.event_sealing_pending_type_lock',
    );
  } else if (!isWlesV1Enabled()) {
    log.error({ companyId }, 'admin.bulk_worker_upload.wles_v1_disabled');
    // Workers exist; the events would constraint-fail at the substrate
    // without the flag. Report rather than throw the success away.
    sealingErrors.push({
      worker_id: 'ALL',
      error: 'WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.',
    });
  } else {
    // Resolve the v1 chain tail once and chain each WORKER_CREATED
    // off the previous WORKER_CREATED's hash so the events form a
    // dense sub-chain inside this batch. After the loop the
    // company's v1 tail is the last WORKER_CREATED's hash.
    let chainTail: string;
    try {
      chainTail = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        companyId,
      );
    } catch (tailErr) {
      const msg = tailErr instanceof Error ? tailErr.message : 'unknown';
      log.error({ err: msg, companyId }, 'admin.bulk_worker_upload.chain_tail_failed');
      sealingErrors.push({ worker_id: 'ALL', error: `chain_tail_failed: ${msg}` });
      chainTail = '';
    }

    if (chainTail) {
      // Index parsed rows by employee_id to recover first_name +
      // last_name + myob_card_id for the sealed payload (the RPC
      // only returns worker_id / employee_id / phone).
      const parsedByEmpId = new Map<string, ParsedWorker>(
        rows.map((r) => [r.employee_id, r] as const),
      );
      for (const c of created) {
        const parsed = parsedByEmpId.get(c.employee_id);
        if (!parsed) {
          sealingErrors.push({
            worker_id: c.worker_id,
            error: 'parsed_row_missing — cannot mint event without first/last name',
          });
          continue;
        }
        const employeeName = `${parsed.first_name} ${parsed.last_name}`.trim();
        try {
          const unsealed = buildWorkerCreated({
            actorId: userId,
            subjectId: c.worker_id,
            timestamp: new Date().toISOString(),
            previousEventHash: chainTail,
            workerId: c.worker_id,
            employeeId: c.employee_id,
            employeeName,
            phoneE164: c.phone,
            myobCardId: parsed.myob_card_id ?? null,
            createdVia: 'bulk_upload',
          });
          const sealed = sealEvent(unsealed);
          await insertV1Event(
            supabase as unknown as Parameters<typeof insertV1Event>[0],
            sealed,
            {
              companyId,
              workerId: c.worker_id,
              siteId: null,
              createdBy: userId,
              eventDataCompat: {
                employee_id: c.employee_id,
                employee_name: employeeName,
                phone_e164: c.phone,
                myob_card_id: parsed.myob_card_id ?? null,
                created_via: 'bulk_upload',
              },
              // Substrate column = FLOSTRUCTION canonical name
              // (Option B). wles_event.event_type inside is
              // X-FLOSMOSIS-WORKER_CREATED until Lauren locks the
              // type registry — see src/lib/wles/v1-translate.ts
              // buildWorkerCreated docstring.
              eventTypeForSubstrate: 'WORKER_CREATED',
            },
          );
          chainTail = sealed.event_hash;
          eventsMinted += 1;
        } catch (sealErr) {
          const msg = sealErr instanceof Error ? sealErr.message : 'unknown';
          log.error(
            { err: msg, workerId: c.worker_id },
            'admin.bulk_worker_upload.event_seal_failed',
          );
          sealingErrors.push({ worker_id: c.worker_id, error: msg });
          // Continue with the rest — partial event coverage beats
          // none. Operator can backfill missing events later.
        }
      }
    }
  }

  log.info(
    {
      companyId,
      created_count: created.length,
      events_minted: eventsMinted,
      event_sealing_pending: eventSealingPending,
      sealing_errors: sealingErrors.length,
    },
    'admin.bulk_worker_upload.success',
  );

  return NextResponse.json(
    {
      created_count: created.length,
      created_workers: created,
      failed_rows: [],
      events_minted: eventsMinted,
      event_sealing_pending: eventSealingPending,
      ...(sealingErrors.length > 0 ? { sealing_errors: sealingErrors } : {}),
    },
    { status: 201 },
  );
}
