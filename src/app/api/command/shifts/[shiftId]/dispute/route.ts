// Flostruction Command — Payroll Admin Dispute/Query Worker
// POST /api/command/shifts/[shiftId]/dispute
// Creates WLES DISPUTE_RAISED event with method: 'PAYROLL_ADMIN'

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildDisputeRaised } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('POST /api/command/shifts/:shiftId/dispute', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  try {
    const { shiftId } = await params;
    const body = await request.json() as {
      admin_user_id: string;
      reason: string;
    };

    if (!shiftId || !body.admin_user_id || !body.reason) {
      return NextResponse.json({ error: 'shiftId, admin_user_id, and reason required' }, { status: 400 });
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

    // GAP-A3-001 closure.
    try {
      await requireCompanyMembership(log, shift.company_id);
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

    const { data: lastEvent } = await supabase
      .from('shift_events')
      .select('event_hash')
      .eq('worker_id', shift.worker_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const previousHash = lastEvent?.event_hash ?? null;

    if (isWlesV1Enabled() && shift.company_id) {
      const previousEventHash = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        shift.company_id,
      );
      const unsealed = buildDisputeRaised({
        actorId: body.admin_user_id,
        subjectId: shift.worker_id,
        timestamp: now.toISOString(),
        previousEventHash,
        shiftId,
        reason: body.reason,
      });
      const sealed = sealEvent(unsealed);
      await insertV1Event(
        supabase as unknown as Parameters<typeof insertV1Event>[0],
        sealed,
        {
          companyId: shift.company_id,
          workerId: shift.worker_id,
          siteId: shift.site_id ?? null,
          createdBy: body.admin_user_id,
          eventDataCompat: eventData,
        },
      );
    } else {
      const hash = generateEventHash({
        company_id: shift.company_id,
        worker_id: shift.worker_id,
        site_id: shift.site_id,
        event_type: 'DISPUTE_RAISED',
        event_data: eventData,
        created_at: now,
      });

      await supabase.from('shift_events').insert({
        company_id: shift.company_id,
        worker_id: shift.worker_id,
        site_id: shift.site_id,
        event_type: 'DISPUTE_RAISED',
        event_data: eventData,
        device_metadata: {},
        event_hash: hash,
        previous_event_hash: previousHash,
        created_at: now.toISOString(),
        created_by: body.admin_user_id,
        spec_version: '0',
      });
    }

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
