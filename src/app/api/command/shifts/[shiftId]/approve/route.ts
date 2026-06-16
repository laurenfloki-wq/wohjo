// Flostruction Command — Final Payroll Approve  (CRACK 218 architectural fix)
// POST /api/command/shifts/[shiftId]/approve
//
// (History and CRACK 218/219 notes preserved in git; see pre-slice-2b
// revision for the long-form header. Behaviour unchanged by CP-1
// slice 2b, 2026-06-10: the unscoped shift read became the
// spine-approved shiftAuthLookup seam (id+company_id only), all other
// fields are re-read post-membership via shiftsMutationRepo(companyId),
// and the chain-tail / legacy-detection / optimistic-lock queries are
// relocated verbatim into the repository module.)
//
// State machine:
//   SUPERVISOR_APPROVED → proceed; PAYROLL_APPROVED/EXPORTED →
//   200 {already_approved:true}; anything else → 409.

import { NextResponse } from 'next/server';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildApproval } from '@/lib/wles/v1-translate';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import {
  shiftAuthLookup,
  refetchShiftStatus,
  workerV0ChainTail,
  legacyFinalApprovalQuery,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';

const PAYROLL_APPROVED = 'PAYROLL_APPROVED';
const EXPORTED = 'EXPORTED';
const SUPERVISOR_APPROVED = 'SUPERVISOR_APPROVED';

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

    // ─── SEAM: unscoped auth lookup (id + company_id only) ────────────
    const { data: authRow, error: authErrorRow } = await shiftAuthLookup(shiftId);
    if (authErrorRow || !authRow) {
      return jsonError(404, 'SHIFT_NOT_FOUND', 'Shift not found');
    }

    // ─── Auth: caller must be an admin of the shift's tenant ──────────
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, authRow.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    const repo = shiftsMutationRepo(authRow.company_id);
    const evRepo = shiftEventsMutationRepo(authRow.company_id);

    // ─── Post-membership re-read (the point of the seam) ──────────────
    const { data: shift, error: shiftError } = await repo.getForApprove(shiftId);
    if (shiftError || !shift) {
      return jsonError(404, 'SHIFT_NOT_FOUND', 'Shift not found');
    }
    const row = shift as {
      id: string;
      worker_id: string;
      site_id: string | null;
      receipt_id: string;
      status: string;
      total_hours: string | null;
    };

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
    const legacyFinal = await findLegacyFinalApproval(row.id, log);

    const now = new Date();

    // ─── Insert PAYROLL_APPROVAL event (unless legacy detection caught) ─
    if (!legacyFinal) {
      const eventData = {
        shift_id: row.id,
        receipt_id: row.receipt_id,
        approved_by_user_id: userId,
        approved_at: now.toISOString(),
      };

      // PAYROLL_APPROVAL event — sealed under WLES v1.0 when the flag is
      // on, legacy v0 otherwise. The v1 substrate event_type column stays
      // canonical ('PAYROLL_APPROVAL', m0d) via eventTypeForSubstrate; the
      // WLES committed type ('APPROVAL', layer:'payroll') lives in
      // wles_event. eventDataCompat preserves the v0 event_data shape so
      // the audit-trail and legacy-final detection queries are unaffected.
      if (isWlesV1Enabled() && authRow.company_id) {
        try {
          const previousEventHash = await evRepo.v1ChainTail();
          const sealed = sealEvent(
            buildApproval({
              actorId: userId,
              subjectId: row.worker_id,
              timestamp: now.toISOString(),
              previousEventHash,
              shiftId: row.id,
              approvedHours: parseFloat(row.total_hours ?? '0'),
              approvalMethod: 'web',
              layer: 'payroll',
            }),
          );
          await evRepo.insertV1(sealed, {
            companyId: authRow.company_id,
            workerId: row.worker_id,
            siteId: row.site_id ?? null,
            createdBy: userId,
            eventTypeForSubstrate: 'PAYROLL_APPROVAL',
            eventDataCompat: eventData,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          log.error({ err: msg, shiftId: row.id }, 'approve.event_insert_failed');
          return jsonError(
            500,
            'EVENT_INSERT_FAILED',
            `Could not record PAYROLL_APPROVAL event: ${msg}`,
          );
        }
      } else {
        const { data: tail } = await workerV0ChainTail(row.worker_id);

        const eventHash = generateEventHash({
          company_id: authRow.company_id,
          worker_id: row.worker_id,
          site_id: row.site_id ?? '',
          event_type: 'PAYROLL_APPROVAL',
          event_data: eventData,
          created_at: now,
        });

        const { error: evtErr } = await evRepo.insertV0Event({
          worker_id: row.worker_id,
          site_id: row.site_id,
          event_type: 'PAYROLL_APPROVAL',
          event_data: eventData,
          device_metadata: {},
          event_hash: eventHash,
          previous_event_hash: (tail as { event_hash: string } | null)?.event_hash ?? null,
          spec_version: '0',
          created_at: now.toISOString(),
          created_by: userId,
        });

        if (evtErr) {
          log.error({ err: evtErr.message, shiftId: row.id }, 'approve.event_insert_failed');
          return jsonError(
            500,
            'EVENT_INSERT_FAILED',
            `Could not record PAYROLL_APPROVAL event: ${evtErr.message}`,
          );
        }
      }
    } else {
      log.info({ shiftId: row.id, legacyEventId: legacyFinal.id }, 'approve.legacy_final_detected');
    }

    // ─── Update shifts row (optimistic-locked on SUPERVISOR_APPROVED) ─
    const { error: updateError, data: updated } = await repo.approveOptimistic(row.id, {
      status: PAYROLL_APPROVED,
      payroll_approved_by: userId,
      payroll_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

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
      const { data: refetched } = await refetchShiftStatus(row.id);
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
 * land for this shift? Query relocated verbatim into the repository
 * module (legacyFinalApprovalQuery); semantics unchanged.
 */
async function findLegacyFinalApproval(
  shiftId: string,
  log: ReturnType<typeof routeLogger>,
): Promise<ShiftEventLite | null> {
  const { data, error } = await legacyFinalApprovalQuery(shiftId);
  if (error) {
    log.warn({ err: error.message, shiftId }, 'approve.legacy_detection_failed');
    return null;
  }
  const rows = (data ?? []) as ShiftEventLite[];
  return rows[0] ?? null;
}
