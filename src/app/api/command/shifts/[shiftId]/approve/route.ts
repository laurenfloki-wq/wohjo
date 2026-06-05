// Flostruction Command — Final Payroll Approve  (CRACK 218 architectural fix)
// POST /api/command/shifts/[shiftId]/approve
//
// Writes a WLES PAYROLL_APPROVAL event (a distinct event_type from
// SUPERVISOR_APPROVAL — see CRACK 218 dispatch 2026-05-11) and
// transitions the shift to PAYROLL_APPROVED.
//
// Pre-CRACK-218 history:
//   * Final approvals were emitted as SUPERVISOR_APPROVAL with
//     event_data.layer='FINAL'. To squeeze multiple SUPERVISOR_APPROVAL
//     rows past the partial-unique-on-shift_id index, prior approvals
//     were retro-tagged with historical_duplicate=true (CRACK 72).
//     That mutates immutable events — WLES Non-Negotiable #2 violation.
//   * PR #26 attempted a cleaner pattern (no retro-tagging) but kept the
//     SUPERVISOR_APPROVAL event_type, so every new attempt hit the
//     unique-violation 409. The PATCH to shifts also passed a hardcoded
//     `'payroll-admin'` string into the UUID column `payroll_approved_by`,
//     producing a 400 even when the event INSERT happened to land.
//
// What this handler does now:
//   1. requireCompanyMembership(shift.company_id) — auth.uid() must be
//      an admin of the shift's tenant. The admin's resolved auth.users.id
//      is used for both `created_by` on the event and `payroll_approved_by`
//      on the shift row. No client-supplied user IDs are trusted.
//   2. State-machine idempotency:
//        - SUPERVISOR_APPROVED → proceed.
//        - PAYROLL_APPROVED or EXPORTED → return 200 {already_approved:true}.
//        - anything else → return 409 with the current status.
//   3. Legacy detection: if the shift already has a SUPERVISOR_APPROVAL
//      with event_data.layer='FINAL' (pre-CRACK-218 path), we DO NOT
//      insert a duplicate PAYROLL_APPROVAL — we just update the shifts
//      row. This grandfathers historical hack-shaped data without
//      mutating it. See FSTR-JRYMJXWR (Lauren's 2026-05-06 prior approval).
//   4. PAYROLL_APPROVAL event: hash-chained off the latest spec_version='0'
//      event for this worker, FOR UPDATE locked, sealed under the
//      canonical v0 generateEventHash().
//   5. Optimistic-lock UPDATE on shifts: `WHERE id = ? AND status =
//      'SUPERVISOR_APPROVED'` — prevents a concurrent race from
//      double-approving.
//
// WLES v1.0 path: PAYROLL_APPROVAL is FLOSTRUCTION-specific (not one of
// the 8 spec-committed event types) and ships under WLES v1.0 as the
// X-FLOSMOSIS-PAYROLL_APPROVAL extension event. Post-cutover (2026-06-04
// T02:56:50Z) the substrate CHECK shift_events_post_cutover_spec_v1
// blocks any new spec_version='0' insert, so the route ALWAYS seals
// under v1.0. If the WLES_V1_ENABLED env is not set the route fails
// closed with a 500 instead of silently falling back — that fallback is
// the root cause of the 2026-06-05 EXPORT_RECORD anomaly.

import { NextResponse } from 'next/server';
import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildPayrollApproval } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

const PAYROLL_APPROVED = 'PAYROLL_APPROVED';
const EXPORTED = 'EXPORTED';
const SUPERVISOR_APPROVED = 'SUPERVISOR_APPROVED';

interface ShiftRow {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string | null;
  receipt_id: string;
  status: string;
  total_hours: string | null;
}

interface ShiftEventLite {
  id: string;
  event_hash: string;
  event_data: Record<string, unknown> | null;
}

export async function POST(request: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const log = routeLogger(
    'POST /api/command/shifts/:shiftId/approve',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  try {
    const { shiftId } = await params;
    if (!shiftId) {
      return jsonError(400, 'INVALID_REQUEST', 'shiftId is required');
    }

    const supabase = createServiceClient();

    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, company_id, worker_id, site_id, receipt_id, status, total_hours')
      .eq('id', shiftId)
      .single();

    if (shiftError || !shift) {
      return jsonError(404, 'SHIFT_NOT_FOUND', 'Shift not found');
    }
    const row = shift as ShiftRow;

    // ─── Auth: caller must be an admin of the shift's tenant ───────────
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, row.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    // ─── State-machine idempotency ─────────────────────────────────────
    if (row.status === PAYROLL_APPROVED || row.status === EXPORTED) {
      log.info({ shiftId, status: row.status }, 'approve.idempotent_replay');
      return NextResponse.json({
        success: true,
        already_approved: true,
        shift_id: shiftId,
        status: row.status,
      });
    }
    if (row.status !== SUPERVISOR_APPROVED) {
      return jsonError(
        409,
        'INVALID_STATE',
        `Shift must be ${SUPERVISOR_APPROVED} to payroll approve. Current status: ${row.status}`,
      );
    }

    // ─── Legacy detection (FSTR-JRYMJXWR-shaped data, pre-CRACK-218) ──
    // If a SUPERVISOR_APPROVAL with layer='FINAL' already exists for this
    // shift, the substrate already has a final-approval event (it's just
    // mis-typed). Don't insert a duplicate — just transition shifts.
    const legacyFinal = await findLegacyFinalApproval(supabase, row.id, log);

    const now = new Date();

    // ─── Insert PAYROLL_APPROVAL event (unless legacy detection caught) ─
    if (!legacyFinal) {
      // Fail-closed: post-cutover the substrate rejects spec_version='0'
      // inserts via shift_events_post_cutover_spec_v1 (NOT VALID). If the
      // env var is missing this would silently fall through to v0 and
      // trip the constraint with a confusing error — throw a clear one
      // instead. Defect B (silent fallback on missing flag) ends here.
      if (!isWlesV1Enabled()) {
        log.error({ shiftId: row.id }, 'approve.wles_v1_disabled');
        return jsonError(
          500,
          'WLES_V1_DISABLED',
          'WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.',
        );
      }
      // Defensive — company_id is NOT NULL at the substrate but a stale
      // SELECT or restrictive RLS could still produce a falsy value at
      // this call site. Reject before reaching sealEvent().
      if (!row.company_id) {
        log.error({ shiftId: row.id }, 'approve.missing_company_id');
        return jsonError(500, 'MISSING_COMPANY_ID', 'company_id is required for v1 sealing');
      }

      const previousEventHash = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        row.company_id,
      );
      const unsealed = buildPayrollApproval({
        actorId: userId,
        subjectId: row.worker_id,
        timestamp: now.toISOString(),
        previousEventHash,
        shiftId: row.id,
        receiptId: row.receipt_id,
        approvedByUserId: userId,
        approvedAt: now.toISOString(),
      });
      const sealed = sealEvent(unsealed);

      const eventDataCompat = {
        shift_id: row.id,
        receipt_id: row.receipt_id,
        approved_by_user_id: userId,
        approved_at: now.toISOString(),
      };

      try {
        await insertV1Event(
          supabase as unknown as Parameters<typeof insertV1Event>[0],
          sealed,
          {
            companyId: row.company_id,
            workerId: row.worker_id,
            siteId: row.site_id ?? null,
            createdBy: userId,
            eventDataCompat,
          },
        );
      } catch (insertErr) {
        const msg = insertErr instanceof Error ? insertErr.message : 'unknown';
        log.error({ err: msg, shiftId: row.id }, 'approve.event_insert_failed');
        return jsonError(500, 'EVENT_INSERT_FAILED', `Could not record PAYROLL_APPROVAL event: ${msg}`);
      }
    } else {
      log.info({ shiftId: row.id, legacyEventId: legacyFinal.id }, 'approve.legacy_final_detected');
    }

    // ─── Update shifts row (optimistic-locked on SUPERVISOR_APPROVED) ─
    const { error: updateError, data: updated } = await supabase
      .from('shifts')
      .update({
        status: PAYROLL_APPROVED,
        payroll_approved_by: userId,
        payroll_approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', row.id)
      .eq('status', SUPERVISOR_APPROVED)
      .select('id, status')
      .maybeSingle();

    if (updateError) {
      log.error({ err: updateError.message, shiftId: row.id }, 'approve.shift_update_failed');
      return jsonError(
        500,
        'SHIFT_UPDATE_FAILED',
        `PAYROLL_APPROVAL event was recorded but the shifts row did not transition: ${updateError.message}`,
      );
    }

    if (!updated) {
      // Optimistic-lock miss: another request (or a manual DB edit) flipped
      // the status between our read and our UPDATE. Re-read and report.
      const { data: refetched } = await supabase
        .from('shifts')
        .select('id, status')
        .eq('id', row.id)
        .maybeSingle();
      const finalStatus = (refetched as { status?: string } | null)?.status ?? 'unknown';
      log.warn({ shiftId: row.id, finalStatus }, 'approve.optimistic_lock_miss');
      return NextResponse.json({
        success: true,
        already_approved: finalStatus === PAYROLL_APPROVED || finalStatus === EXPORTED,
        shift_id: row.id,
        status: finalStatus,
      });
    }

    log.info(
      {
        shiftId: row.id,
        legacy: !!legacyFinal,
        userId,
      },
      'approve.completed',
    );

    return NextResponse.json({
      success: true,
      shift_id: row.id,
      status: PAYROLL_APPROVED,
      legacy_grandfathered: !!legacyFinal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonError(500, 'INTERNAL', message);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error_code: code, error_message: message },
    { status },
  );
}

/**
 * Legacy detection: did a pre-CRACK-218 final-approval event already
 * land for this shift? Pre-CRACK-218 those were SUPERVISOR_APPROVAL
 * events with event_data.layer='FINAL'. If we find one we DO NOT insert
 * a new PAYROLL_APPROVAL — that would imply two final approvals on the
 * audit trail. We just transition the shifts row.
 */
async function findLegacyFinalApproval(
  supabase: ReturnType<typeof createServiceClient>,
  shiftId: string,
  log: Logger,
): Promise<ShiftEventLite | null> {
  const { data, error } = await supabase
    .from('shift_events')
    .select('id, event_hash, event_data')
    .eq('event_type', 'SUPERVISOR_APPROVAL')
    .filter('event_data->>shift_id', 'eq', shiftId)
    .filter('event_data->>layer', 'eq', 'FINAL')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    log.warn({ err: error.message, shiftId }, 'approve.legacy_detection_failed');
    return null;
  }
  const rows = (data ?? []) as ShiftEventLite[];
  return rows[0] ?? null;
}
