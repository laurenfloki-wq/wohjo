// Flostruction Command — Payroll Admin Dispute/Query Worker
// POST /api/command/shifts/[shiftId]/dispute
// Creates WLES DISPUTE_RAISED event with method: 'PAYROLL_ADMIN'

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildDisputeRaised } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
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

    const supabase = createServiceClient();

    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, company_id, worker_id, site_id, receipt_id, status')
      .eq('id', shiftId)
      .single();

    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // GAP-A3-001 closure + CRACK 218 audit fix: derive admin user_id from
    // the session rather than trusting userId.
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, shift.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    const now = new Date();

    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'PAYROLL_ADMIN' as const,
      reason: body.reason,
    };

    // Fail-closed + company_id assertion (Defect B). The substrate now
    // blocks any spec_version='0' insert post-cutover, so a silent
    // fallback would surface as a confusing constraint error; throw
    // explicitly instead.
    if (!isWlesV1Enabled()) {
      return NextResponse.json(
        { error: 'WLES_V1_ENABLED must be set; v0 writes are blocked at the substrate post-cutover.' },
        { status: 500 },
      );
    }
    if (!shift.company_id) {
      return NextResponse.json(
        { error: 'company_id is required for v1 sealing' },
        { status: 500 },
      );
    }

    const previousEventHash = await getV1ChainTail(
      supabase as unknown as Parameters<typeof getV1ChainTail>[0],
      shift.company_id,
    );
    const unsealed = buildDisputeRaised({
      actorId: userId,
      subjectId: shift.worker_id,
      timestamp: now.toISOString(),
      previousEventHash,
      shiftId,
      reason: body.reason,
    });
    const sealed = sealEvent(unsealed);
    await insertV1Event(supabase as unknown as Parameters<typeof insertV1Event>[0], sealed, {
      companyId: shift.company_id,
      workerId: shift.worker_id,
      siteId: shift.site_id ?? null,
      createdBy: userId,
      eventDataCompat: eventData,
      // Substrate column = legacy DISPUTE_RAISED so
      // shift_events_event_data_shape requires shift_id in event_data
      // (eventDataCompat carries it). wles_event.event_type stays as
      // X-FLOSMOSIS-DISPUTE_RAISED for verifier conformance.
      eventTypeForSubstrate: 'DISPUTE_RAISED',
    });

    await supabase
      .from('shifts')
      .update({
        status: 'DISPUTED',
        updated_at: now.toISOString(),
      })
      .eq('id', shiftId);

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
