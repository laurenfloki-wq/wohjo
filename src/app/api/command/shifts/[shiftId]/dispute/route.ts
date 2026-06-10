// Flostruction Command — Payroll Admin Dispute/Query Worker
// POST /api/command/shifts/[shiftId]/dispute
// Creates WLES DISPUTE_RAISED event with method: 'PAYROLL_ADMIN'
//
// CP-1 slice 2b (2026-06-10): unscoped shift read became the
// shiftAuthLookup seam; fields re-read post-membership; chain-tail and
// the .eq('id')-only UPDATE relocated verbatim; v1 path uses repo
// pass-throughs. Behaviour unchanged.

import { NextResponse } from 'next/server';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildDisputeRaised } from '@/lib/wles/v1-translate';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import {
  shiftAuthLookup,
  workerChainTail,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';

export async function POST(request: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const log = routeLogger(
    'POST /api/command/shifts/:shiftId/dispute',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  try {
    const { shiftId } = await params;
    const body = (await request.json()) as {
      // CRACK 218 audit: admin_user_id is no longer trusted from the client;
      // tolerated in the type for backward compatibility, but ignored.
      admin_user_id?: string;
      reason: string;
    };

    if (!shiftId || !body.reason) {
      return NextResponse.json({ error: 'shiftId and reason required' }, { status: 400 });
    }

    // SEAM: unscoped auth lookup (id + company_id only).
    const { data: authRow, error: authErr } = await shiftAuthLookup(shiftId);
    if (authErr || !authRow) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // GAP-A3-001 closure + CRACK 218 audit fix: derive admin user_id from
    // the session rather than trusting userId.
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, authRow.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    const repo = shiftsMutationRepo(authRow.company_id);
    const evRepo = shiftEventsMutationRepo(authRow.company_id);

    // Post-membership re-read.
    const { data: shift, error: shiftError } = await repo.getForDispute(shiftId);
    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const now = new Date();

    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'PAYROLL_ADMIN' as const,
      reason: body.reason,
    };

    const { data: lastEvent } = await workerChainTail(shift.worker_id);

    const previousHash = (lastEvent as { event_hash: string } | null)?.event_hash ?? null;

    if (isWlesV1Enabled() && authRow.company_id) {
      const previousEventHash = await evRepo.v1ChainTail();
      const unsealed = buildDisputeRaised({
        actorId: userId,
        subjectId: shift.worker_id,
        timestamp: now.toISOString(),
        previousEventHash,
        shiftId,
        reason: body.reason,
      });
      const sealed = sealEvent(unsealed);
      await evRepo.insertV1(sealed, {
        companyId: authRow.company_id,
        workerId: shift.worker_id,
        siteId: shift.site_id ?? null,
        createdBy: userId,
        eventDataCompat: eventData,
      });
    } else {
      const hash = generateEventHash({
        company_id: authRow.company_id,
        worker_id: shift.worker_id,
        site_id: shift.site_id,
        event_type: 'DISPUTE_RAISED',
        event_data: eventData,
        created_at: now,
      });

      await evRepo.insertV0Event({
        worker_id: shift.worker_id,
        site_id: shift.site_id,
        event_type: 'DISPUTE_RAISED',
        event_data: eventData,
        device_metadata: {},
        event_hash: hash,
        previous_event_hash: previousHash,
        created_at: now.toISOString(),
        created_by: userId,
        spec_version: '0',
      });
    }

    await repo.updateToDisputed(shiftId, now.toISOString());

    return NextResponse.json({
      success: true,
      shift_id: shiftId,
      status: 'DISPUTED',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
