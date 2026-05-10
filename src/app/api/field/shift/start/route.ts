// Day 5 P1.3 — GAP-A3-002 closure. worker_id no longer accepted from
// the client; derived server-side from the phone-OTP session.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import { checkDuplicateStartEvent } from '@/lib/wles/sync-guard';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildClockIn } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
function generateReceiptId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'FSTR-';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function getAESTDate(): string {
  return new Date().toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-');
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/field/shift/start', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // GAP-A3-002 closure: derive worker identity from the session.
  let workerId: string;
  let workerCompanyId: string | null;
  try {
    ({ workerId, companyId: workerCompanyId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const body = await request.json() as {
      site_id?: string;
      gps_lat?: string;
      gps_lng?: string;
      gps_accuracy_metres?: string;
      device_metadata?: Record<string, unknown>;
      worker_note?: string;
      // L3.3 (P7-C1) — worker-app generates a UUID before POSTing
      // the CLOCK_IN. Server stores it inside event_data and the
      // partial unique index uq_shift_events_client_event_id (per
      // migration 202604251200) deduplicates retry storms to
      // exactly one sealed event. Optional for backward
      // compatibility; older clients without the field still
      // function — they just lose the retry-safe property.
      client_event_id?: string;
    };
    const { site_id, gps_lat, gps_lng, gps_accuracy_metres, device_metadata, worker_note, client_event_id } = body;

    // Validate the optional client_event_id is a UUID. Reject malformed
    // values rather than silently dropping them — that would defeat
    // the dedupe path and make the bug invisible.
    if (
      client_event_id !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        client_event_id,
      )
    ) {
      return NextResponse.json(
        { error: 'INVALID_CLIENT_EVENT_ID', message: 'client_event_id must be a UUID' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Fetch worker to get pay_rate (company_id already derived).
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id, company_id, pay_rate')
      .eq('id', workerId)
      .eq('is_active', true)
      .single();

    if (workerError || !worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    const shiftDate = getAESTDate();

    // Non-negotiable: sync conflict guard
    const existingShiftId = await checkDuplicateStartEvent(supabase, workerId, shiftDate);
    if (existingShiftId) {
      return NextResponse.json({
        error: 'Shift already started today',
        existing_shift_id: existingShiftId,
      }, { status: 409 });
    }

    const now = new Date();
    const receiptId = generateReceiptId();

    const eventData: Record<string, unknown> = {
      start_time: now.toISOString(),
      shift_date: shiftDate,
      gps_lat: gps_lat ?? null,
      gps_lng: gps_lng ?? null,
    };
    // P7-C1 wiring — embed the client-provided UUID in event_data so
    // the partial unique index dedupes any retry to exactly one row.
    if (client_event_id) {
      eventData.client_event_id = client_event_id;
    }

    // ─── WLES v1.0 conformance sealing (gated by WLES_V1_ENABLED) ───
    // Post-activation: seal via the v1.0 canonical-JSON path and write
    // to shift_events with spec_version='1.0' + wles_event jsonb.
    // Pre-activation: seal via the legacy v0 pipe-delimited path.
    //
    // See Annex v2.1 §5, cascade v2.0 §A§2.1. Feature flag default is
    // fail-closed (v0) per src/lib/wles/flags.ts.

    if (isWlesV1Enabled() && worker.company_id) {
      // v1.0 path — sealed CLOCK_IN event
      const previousEventHash = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        worker.company_id,
      );
      const unsealed = buildClockIn({
        actorId: workerId,
        subjectId: workerId,
        timestamp: now.toISOString(),
        previousEventHash,
        shiftId: receiptId,
        siteId: site_id ?? '',
        detectionMethod: site_id ? 'geofence' : 'manual',
        ...(gps_lat && gps_lng
          ? {
              metadata: {
                geolocation: {
                  latitude: Number(gps_lat),
                  longitude: Number(gps_lng),
                  ...(gps_accuracy_metres ? { accuracy: Number(gps_accuracy_metres) } : {}),
                },
              },
            }
          : {}),
      });
      const sealed = sealEvent(unsealed);

      try {
        await insertV1Event(
          supabase as unknown as Parameters<typeof insertV1Event>[0],
          sealed,
          {
            companyId: worker.company_id,
            workerId,
            siteId: site_id ?? null,
            createdBy: workerId,
            gpsLat: gps_lat ?? null,
            gpsLng: gps_lng ?? null,
            gpsAccuracyMetres: gps_accuracy_metres ?? null,
            deviceMetadata: device_metadata ?? {},
            eventDataCompat: eventData,
          },
        );
      } catch (err) {
        // P7-C1 — duplicate client_event_id is a successful retry,
        // not an error. Look up the original sealed event and return
        // its identifiers so the worker app can move on. Postgres
        // unique-violation surfaces as code '23505' on the error
        // object emitted by @supabase/postgrest-js.
        const replay = await tryRetryReplay(
          supabase, err, workerId, client_event_id, log,
        );
        if (replay) return replay;
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          'field.shift.start.v1_insert_failed',
        );
        return NextResponse.json({ error: 'Failed to record shift event' }, { status: 500 });
      }
    } else {
      // v0 path — legacy pipe-delimited hash, retained for rollback safety
      const eventHash = generateEventHash({
        company_id: worker.company_id ?? '',
        worker_id: workerId,
        site_id: site_id ?? '',
        event_type: 'START_EVENT',
        event_data: eventData,
        created_at: now,
      });

      const { data: shiftEvent, error: eventError } = await supabase
        .from('shift_events')
        .insert({
          company_id: worker.company_id,
          worker_id: workerId,
          site_id: site_id ?? null,
          event_type: 'START_EVENT',
          event_data: eventData,
          device_metadata: device_metadata ?? {},
          gps_lat: gps_lat ?? null,
          gps_lng: gps_lng ?? null,
          gps_accuracy_metres: gps_accuracy_metres ?? null,
          event_hash: eventHash,
          previous_event_hash: null,
          created_at: now.toISOString(),
          created_by: workerId,
          spec_version: '0',
        })
        .select('id')
        .single();

      if (eventError || !shiftEvent) {
        // P7-C1 — duplicate client_event_id replay handling for v0
        // path. Same logic as the v1 branch above.
        const replay = await tryRetryReplay(
          supabase, eventError, workerId, client_event_id, log,
        );
        if (replay) return replay;
        return NextResponse.json({ error: 'Failed to record shift event' }, { status: 500 });
      }
    }

    // Insert shift record with server-authoritative IN_PROGRESS state
    // (ARCH-1: explicit state machine, not end_time-null inference).
    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .insert({
        company_id: worker.company_id,
        worker_id: workerId,
        site_id: site_id ?? null,
        shift_date: shiftDate,
        start_time: now.toISOString(),
        receipt_id: receiptId,
        status: 'IN_PROGRESS',
        confidence_score: 50,
        worker_note: worker_note ?? null,
      })
      .select('id, receipt_id')
      .single();

    if (shiftError || !shift) {
      log.error(
        { err: shiftError?.message, workerId, siteId: site_id },
        'field.shift.start.insert_failed',
      );
      return NextResponse.json({ error: 'Failed to create shift' }, { status: 500 });
    }

    return NextResponse.json({
      shift_id: shift.id,
      receipt_id: shift.receipt_id,
      started_at: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── P7-C1 helper: retry-storm replay ────────────────────────────────
// When a client retries a CLOCK_IN with the same client_event_id, the
// shift_events partial unique index returns Postgres error 23505
// (unique_violation). The retry is BY DESIGN; the caller wants to be
// told that the original event already exists so it can stop
// retrying. Look up the original sealed event + the existing IN_PROGRESS
// shift and return the same identifiers a fresh insert would have
// returned. If we can't find them (race-window edge case), fall
// through to the original error path.
async function tryRetryReplay(
  supabase: ReturnType<typeof createServiceClient>,
  err: unknown,
  workerId: string,
  clientEventId: string | undefined,
  log: ReturnType<typeof routeLogger>,
): Promise<Response | null> {
  if (!clientEventId) return null;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;
  if (code !== '23505') return null;

  // Find the original sealed CLOCK_IN/START_EVENT bearing this
  // client_event_id for this worker.
  const { data: existing } = await supabase
    .from('shift_events')
    .select('id, created_at')
    .eq('worker_id', workerId)
    .filter('event_data->>client_event_id', 'eq', clientEventId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!existing) {
    log.warn(
      { workerId, clientEventId },
      'field.shift.start.replay.original_not_found',
    );
    return null;
  }

  // Find the matching IN_PROGRESS shift on the same date.
  const aestDate = getAESTDate();
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, receipt_id, start_time')
    .eq('worker_id', workerId)
    .eq('shift_date', aestDate)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  log.info(
    { workerId, clientEventId, eventId: existing.id, shiftId: shift?.id },
    'field.shift.start.replay.served',
  );

  return NextResponse.json(
    {
      shift_id: shift?.id ?? null,
      receipt_id: shift?.receipt_id ?? null,
      started_at: shift?.start_time ?? existing.created_at,
      replayed: true,
    },
    { status: 200 },
  );
}
