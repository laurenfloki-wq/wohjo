// Flostruction Command — Final Payroll Approve
// POST /api/command/shifts/[shiftId]/approve
// Creates WLES payroll approval event with layer: 'FINAL'
// Only enabled when shift is already SUPERVISOR_APPROVED.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildApproval } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('POST /api/command/shifts/:shiftId/approve', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  try {
    const { shiftId } = await params;
    const body = await request.json() as { admin_user_id: string };

    if (!shiftId || !body.admin_user_id) {
      return NextResponse.json({ error: 'shiftId and admin_user_id required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, company_id, worker_id, site_id, receipt_id, status, total_hours')
      .eq('id', shiftId)
      .single();

    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // GAP-A3-001 closure: admin must be a member of the shift's company.
    try {
      await requireCompanyMembership(log, shift.company_id);
    } catch (err) {
      return authErrorResponse(err);
    }

    if (shift.status !== 'SUPERVISOR_APPROVED') {
      return NextResponse.json(
        { error: `Shift must be SUPERVISOR_APPROVED to payroll approve. Current: ${shift.status}` },
        { status: 409 }
      );
    }

    const now = new Date();

    // Create WLES payroll approval event (distinct layer: 'FINAL')
    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'PAYROLL_ADMIN' as const,
      layer: 'FINAL' as const,
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
      const unsealed = buildApproval({
        actorId: body.admin_user_id,
        subjectId: shift.worker_id,
        timestamp: now.toISOString(),
        previousEventHash,
        shiftId,
        approvedHours: typeof shift.total_hours === 'number' ? shift.total_hours : 0,
        approvalMethod: 'web',
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
        event_type: 'SUPERVISOR_APPROVAL',
        event_data: eventData,
        created_at: now,
      });

      await supabase.from('shift_events').insert({
        company_id: shift.company_id,
        worker_id: shift.worker_id,
        site_id: shift.site_id,
        event_type: 'SUPERVISOR_APPROVAL',
        event_data: eventData,
        device_metadata: {},
        event_hash: hash,
        previous_event_hash: previousHash,
        created_at: now.toISOString(),
        created_by: body.admin_user_id,
        spec_version: '0',
      });
    }

    // Update shift to PAYROLL_APPROVED
    await supabase
      .from('shifts')
      .update({
        status: 'PAYROLL_APPROVED',
        payroll_approved_by: body.admin_user_id,
        payroll_approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', shiftId);

    return NextResponse.json({
      success: true,
      shift_id: shiftId,
      status: 'PAYROLL_APPROVED',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
