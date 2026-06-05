// Flostruction Field — Shift End + SHIFT_COMMIT Route
// POST /api/field/shift/end
//
// Worker submits their finished shift. Creates END_EVENT + SHIFT_COMMIT
// WLES events and transitions shifts.status IN_PROGRESS → SUBMITTED.
//
// Day 5 P1.3 — GAP-A3-002 closure. worker_id derived from session.
// Day 6 redesign (2026-04-22) — ARCH-1/2/3 + A3 fixes:
//   ARCH-1: status transition is server-authoritative (IN_PROGRESS → SUBMITTED)
//   ARCH-2: re-call protection — rejects unless status='IN_PROGRESS'
//   ARCH-3: error-checked DB mutations — no silent failures
//   A3:     zero/negative duration rejected; never stored as success

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { triggerLateSubmissionSMS } from '@/lib/sms/late-trigger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { classifyEndShift, VALID_BREAK_MINUTES } from '@/lib/field/shift-state-machine';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildClockOut, buildShiftCommit } from '@/lib/wles/v1-translate';
import { emitAuthEvent } from '@/lib/auth/auth-events-emit';
import { emitGeofenceEvent } from '@/lib/intelligence/geofence-events-emit';
import { getV1ChainTail, insertV1Event, FLOSMOSIS_SYSTEM_ACTOR_ID } from '@/lib/wles/v1-chain';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/field/shift/end', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  let sessionWorkerId: string;
  try {
    ({ workerId: sessionWorkerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const body = (await request.json()) as {
      shift_id: string;
      end_time?: string;
      break_minutes?: number;
      worker_note?: string;
      gps_lat?: string;
      gps_lng?: string;
      gps_accuracy_metres?: string;
      // 2026-05-02 Saturday Task 6 — client_event_id is the worker's
      // device-side idempotency key. Generated client-side on the
      // first End Shift tap. Repeats of the same tap re-send the
      // same id; the END_EVENT INSERT is database-level deduplicated
      // via uq_shift_events_end_idempotent (migration 202605020940).
      client_event_id?: string;
    };

    const {
      shift_id,
      break_minutes = 0,
      worker_note,
      gps_lat,
      gps_lng,
      gps_accuracy_metres,
      client_event_id,
    } = body;

    if (!shift_id) {
      return NextResponse.json(
        { error: 'shift_id required', code: 'MISSING_SHIFT_ID' },
        { status: 400 },
      );
    }

    if (!VALID_BREAK_MINUTES.includes(break_minutes as (typeof VALID_BREAK_MINUTES)[number])) {
      return NextResponse.json(
        { error: 'break_minutes must be 0, 15, 30, 45, or 60', code: 'INVALID_BREAK' },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();

    // Fetch current shift
    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, worker_id, site_id, company_id, start_time, end_time, status, receipt_id')
      .eq('id', shift_id)
      .single();

    if (shiftError || !shift) {
      log.warn({ shiftId: shift_id, err: shiftError?.message }, 'field.shift.end.not_found');
      return NextResponse.json(
        { error: 'Shift not found', code: 'SHIFT_NOT_FOUND' },
        { status: 404 },
      );
    }

    // Cross-worker guard — only the owning worker may end their shift.
    if (shift.worker_id !== sessionWorkerId) {
      log.warn(
        { sessionWorkerId, shiftWorkerId: shift.worker_id, shiftId: shift.id },
        'field.shift.end.cross_worker_denied',
      );
      return NextResponse.json(
        { error: 'Forbidden: shift belongs to another worker.', code: 'FORBIDDEN_WORKER' },
        { status: 403 },
      );
    }

    const now = new Date();
    const endTime = body.end_time ? new Date(body.end_time) : now;

    // Delegate A3 + ARCH-2 + duration bounds to the pure classifier.
    // Keeps the route simple and shares logic with the unit tests.
    const disposition = classifyEndShift({
      shift: {
        id: shift.id,
        status: shift.status as 'IN_PROGRESS',
        start_time: shift.start_time,
        end_time: shift.end_time,
      },
      endIso: endTime.toISOString(),
      breakMinutes: break_minutes,
    });

    if (disposition.kind === 'reject') {
      const statusCode = disposition.reason === 'NOT_IN_PROGRESS' ? 409 : 400;
      const errorMessage = (() => {
        switch (disposition.reason) {
          case 'NOT_IN_PROGRESS':
            return 'This shift has already been ended.';
          case 'END_BEFORE_START':
            return "Your shift's end time is not after its start time. If your phone's clock is correct, please contact support@flosmosis.com with your receipt ID.";
          case 'BELOW_MINIMUM_DURATION':
            return 'Your shift is shorter than the minimum recordable duration. If this is a mistake, contact support@flosmosis.com with your receipt ID.';
          case 'EXCEEDS_MAXIMUM_DURATION':
            return 'Calculated hours exceed the 24-hour maximum. If your phone clock is correct, please contact support@flosmosis.com with your receipt ID.';
          case 'INVALID_BREAK':
            return 'break_minutes must be 0, 15, 30, 45, or 60';
        }
      })();

      log.warn(
        { shiftId: shift.id, reason: disposition.reason, status: shift.status },
        'field.shift.end.rejected',
      );

      return NextResponse.json(
        {
          error: errorMessage,
          code: disposition.reason,
          receipt_id: shift.receipt_id,
          status: shift.status,
        },
        { status: statusCode },
      );
    }

    const totalHours = disposition.totalHours;

    // Get last event hash for chain continuity.
    const { data: lastEvent, error: lastEventError } = await supabase
      .from('shift_events')
      .select('event_hash')
      .eq('worker_id', shift.worker_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // lastEventError with PGRST116 (no rows) is acceptable — this would
    // be the worker's first-ever event. Any other error is unexpected.
    if (lastEventError && lastEventError.code !== 'PGRST116') {
      log.error(
        { err: lastEventError.message, workerId: shift.worker_id },
        'field.shift.end.last_event_lookup_failed',
      );
      return NextResponse.json(
        {
          error: 'Could not read event chain. Please try again in a moment.',
          code: 'CHAIN_READ_FAILED',
        },
        { status: 500 },
      );
    }

    const previousHash = lastEvent?.event_hash ?? null;

    // 1. END_EVENT (v0) / CLOCK_OUT (v1) — ARCH-3 error checked.
    // client_event_id is embedded in event_data so the
    // uq_shift_events_end_idempotent partial index (migration
    // 202605020940) can dedupe duplicate END Shift taps from the
    // worker app. PG raises error 23505 (unique_violation) on
    // re-insert; the route catches and returns idempotent success.
    const endEventData: Record<string, unknown> = {
      shift_id,
      end_time: endTime.toISOString(),
      break_minutes,
      total_hours: totalHours,
    };
    if (client_event_id) {
      endEventData.client_event_id = client_event_id;
    }

    // `endHash` is the chain predecessor for the SHIFT_COMMIT event
    // that follows in step 3. Always set from the sealed v1.0 event.
    let endHash: string;

    // Fail-closed + company_id assertion. Post-cutover the substrate
    // blocks v0 inserts; surface a clear error rather than letting a
    // silent v0 fallback hit the constraint with a confusing message.
    if (!isWlesV1Enabled()) {
      log.error({}, 'field.shift.end.wles_v1_disabled');
      return NextResponse.json(
        { error: 'WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.' },
        { status: 500 },
      );
    }
    if (!shift.company_id) {
      log.error({ shiftId: shift.id }, 'field.shift.end.missing_company_id');
      return NextResponse.json(
        { error: 'company_id is required for v1 sealing' },
        { status: 500 },
      );
    }
    void previousHash; /* legacy chain lookup retained above for diagnostic logging */

    const previousEventHash = await getV1ChainTail(
      supabase as unknown as Parameters<typeof getV1ChainTail>[0],
      shift.company_id,
    );
    const unsealedEnd = buildClockOut({
      actorId: shift.worker_id,
      subjectId: shift.worker_id,
      timestamp: endTime.toISOString(),
      previousEventHash,
      shiftId: shift_id,
      siteId: shift.site_id ?? '',
      workerConfirmedStartAt: shift.start_time,
      startTimeSource: 'worker_confirmed',
    });
    const sealedEnd = sealEvent(unsealedEnd);
    try {
      await insertV1Event(supabase as unknown as Parameters<typeof insertV1Event>[0], sealedEnd, {
        companyId: shift.company_id,
        workerId: shift.worker_id,
        siteId: shift.site_id ?? null,
        createdBy: shift.worker_id,
        gpsLat: gps_lat ?? null,
        gpsLng: gps_lng ?? null,
        gpsAccuracyMetres: gps_accuracy_metres ?? null,
        eventDataCompat: endEventData,
      });
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err), shiftId: shift.id },
        'field.shift.end.v1_end_insert_failed',
      );
      return NextResponse.json(
        {
          error: 'Could not record shift end. Please try again in a moment.',
          code: 'END_EVENT_FAILED',
        },
        { status: 500 },
      );
    }
    endHash = sealedEnd.event_hash;

    // 2. Update shift record — ARCH-1 (status transition) + ARCH-3 (error check).
    // The .eq('status', 'IN_PROGRESS') compound predicate is a belt-and-
    // braces concurrency guard: even if two simultaneous shift/end
    // requests race past the earlier status check, only one UPDATE
    // will match and mutate the row.
    //
    // 2026-05-01 hotfix: shifts UPDATE no longer writes gps_lat/gps_lng/
    // gps_accuracy_metres — those columns don't exist on the shifts
    // table (they're on shift_events, where the END_EVENT INSERT above
    // already records them correctly). The previous UPDATE failed
    // silently due to schema drift, leaving shifts in IN_PROGRESS
    // state while END_EVENT inserted successfully — surfaced during
    // Joao E2E test ~3pm AEST. Schema-drift guard test pinned at
    // route.test.ts.
    const { data: updated, error: updateError } = await supabase
      .from('shifts')
      .update({
        end_time: endTime.toISOString(),
        break_minutes,
        total_hours: totalHours.toFixed(2),
        worker_note: worker_note ?? null,
        status: 'SUBMITTED',
        updated_at: now.toISOString(),
      })
      .eq('id', shift_id)
      .eq('status', 'IN_PROGRESS')
      .select('id, status, end_time, total_hours')
      .single();

    if (updateError || !updated) {
      log.error(
        { err: updateError?.message, shiftId: shift.id },
        'field.shift.end.shifts_update_failed',
      );
      // We have already written the END_EVENT; surface a diagnostic so
      // the client can retry or the worker can escalate. The shift
      // remains IN_PROGRESS until this UPDATE succeeds.
      return NextResponse.json(
        {
          error:
            'Could not finalise shift. Your end-of-shift event was recorded but the shift state did not update. Please retry.',
          code: 'SHIFT_UPDATE_FAILED',
          receipt_id: shift.receipt_id,
        },
        { status: 500 },
      );
    }

    // 3. SHIFT_COMMIT event (triggers Intelligence) — ARCH-3 error checked
    const commitAt = new Date(endTime.getTime() + 1);
    const commitEventData = {
      shift_id,
      receipt_id: shift.receipt_id,
      total_hours: totalHours,
      break_minutes,
      committed_at: commitAt.toISOString(),
    };

    let commitEventError: { message?: string } | null = null;

    // company_id assertion already performed above; isWlesV1Enabled()
    // was checked above too. The constraint guarantees v0 cannot be
    // written post-cutover even if a future regression reintroduced
    // the silent fallback.
    const unsealedCommit = buildShiftCommit({
      actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
      subjectId: shift.worker_id,
      timestamp: commitAt.toISOString(),
      previousEventHash: endHash,
      shiftId: shift_id,
      siteId: shift.site_id ?? '',
    });
    const sealedCommit = sealEvent(unsealedCommit);
    try {
      await insertV1Event(
        supabase as unknown as Parameters<typeof insertV1Event>[0],
        sealedCommit,
        {
          companyId: shift.company_id,
          workerId: shift.worker_id,
          siteId: shift.site_id ?? null,
          createdBy: shift.worker_id,
          eventDataCompat: commitEventData,
        },
      );
    } catch (err) {
      commitEventError = { message: err instanceof Error ? err.message : String(err) };
    }

    if (commitEventError) {
      // The shift is already UPDATE'd to SUBMITTED and END_EVENT is in
      // the ledger. Missing SHIFT_COMMIT is a chain-integrity defect
      // that admin_access_log + chain-verify cron will surface tonight.
      // We do NOT roll the UPDATE back — that would move the shift back
      // to IN_PROGRESS and re-open a valid worker submission for the
      // re-call protection above. Instead we return 200 with a degraded
      // flag; the retry safeguard is chain-verify cron at 03:00.
      log.error(
        { err: commitEventError.message, shiftId: shift.id },
        'field.shift.end.shift_commit_failed_degraded',
      );
    }

    // 4. Trigger Intelligence analysis — non-blocking (fire and forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    if (appUrl) {
      fetch(`${appUrl}/api/intelligence/analyse/${shift_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Silent — Intelligence failure never blocks submission
      });
    }

    // 5. Late submission SMS trigger — non-blocking (fire and forget)
    triggerLateSubmissionSMS(shift_id).catch(() => {
      // Silent — SMS failure never blocks submission
    });

    log.info(
      { shiftId: shift.id, totalHours, degraded: Boolean(commitEventError) },
      'field.shift.end.completed',
    );

    // Gate R-FOR-1 — auth_events side-pipe emission for clock-out.
    // Read worker phone for actor_phone field; fail-soft on error.
    const { data: workerForAuthEvent } = await supabase
      .from('workers')
      .select('phone')
      .eq('id', shift.worker_id)
      .maybeSingle();
    void emitAuthEvent(log, {
      eventType: 'X-FLOSMOSIS-WORKER_SHIFT_END_AUTHN',
      actorUserId: shift.worker_id,
      actorPhone: (workerForAuthEvent as { phone?: string | null } | null)?.phone ?? null,
      companyId: shift.company_id,
      request,
      payload: {
        shift_id: shift.id,
        receipt_id: shift.receipt_id,
        total_hours: totalHours,
      },
      supabase,
    });

    // Gate R-FOR-1 — geofence_events side-pipe emission at clock-out.
    if (gps_lat && gps_lng && shift.site_id) {
      const { data: site } = await supabase
        .from('sites')
        .select('id, lat, lng, geofence_radius_metres')
        .eq('id', shift.site_id)
        .maybeSingle();
      if (site && site.lat != null && site.lng != null && site.geofence_radius_metres != null) {
        void emitGeofenceEvent(log, {
          workerId: shift.worker_id,
          siteId: site.id,
          detectedAt: endTime,
          workerLat: Number(gps_lat),
          workerLng: Number(gps_lng),
          workerAccuracyMetres: gps_accuracy_metres ? Number(gps_accuracy_metres) : 50,
          siteLat: Number(site.lat),
          siteLng: Number(site.lng),
          siteRadiusMetres: Number(site.geofence_radius_metres),
          companyId: shift.company_id,
          supabase,
        });
      }
    }

    return NextResponse.json({
      success: true,
      shift_id,
      receipt_id: shift.receipt_id,
      total_hours: totalHours,
      end_time: endTime.toISOString(),
      status: 'SUBMITTED',
      degraded: commitEventError ? 'SHIFT_COMMIT_EVENT_MISSING' : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
