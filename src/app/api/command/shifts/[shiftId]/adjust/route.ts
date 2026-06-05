// Flostruction Command — Adjust Hours
// POST /api/command/shifts/[shiftId]/adjust
// Adjusts hours and implicitly final-approves the shift.
// Creates WLES adjustment event with original and adjusted values + reason.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildCorrection } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function POST(request: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const log = routeLogger(
    'POST /api/command/shifts/:shiftId/adjust',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  try {
    const { shiftId } = await params;
    const body = (await request.json()) as {
      // CRACK 218 audit: admin_user_id is no longer trusted from the client.
      // Tolerated in the type for backward compatibility, but ignored.
      admin_user_id?: string;
      adjusted_start_time: string;
      adjusted_end_time: string;
      adjusted_break_minutes: number;
      reason: string;
    };

    if (!shiftId || !body.reason) {
      return NextResponse.json({ error: 'shiftId and reason required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select(
        'id, company_id, worker_id, site_id, receipt_id, start_time, end_time, break_minutes, total_hours, status',
      )
      .eq('id', shiftId)
      .single();

    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // GAP-A3-001 closure + CRACK 218 audit fix: derive admin auth.users UUID
    // from the session rather than trusting the client. payroll_approved_by
    // is a UUID column — the prior code path passed the literal string
    // 'payroll-admin' from the UI and produced a 400 invalid-UUID PATCH.
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, shift.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    const now = new Date();

    // Calculate adjusted total hours
    const adjStart = new Date(body.adjusted_start_time);
    const adjEnd = new Date(body.adjusted_end_time);
    const adjBreak = body.adjusted_break_minutes ?? 0;
    const adjTotalHoursRaw =
      (adjEnd.getTime() - adjStart.getTime()) / (1000 * 60 * 60) - adjBreak / 60;
    const adjTotalHours = Math.round(Math.max(0, adjTotalHoursRaw) * 100) / 100;

    // Security: validate adjusted hours are within reasonable bounds
    if (adjTotalHours > 24 || adjTotalHours < 0) {
      return NextResponse.json(
        {
          error:
            'Adjusted hours must be between 0 and 24. Please check your adjusted start and end times.',
        },
        { status: 400 },
      );
    }

    // Create WLES adjustment event with original + adjusted values
    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'PAYROLL_ADMIN' as const,
      layer: 'ADJUSTMENT' as const,
      reason: body.reason,
      original: {
        start_time: shift.start_time,
        end_time: shift.end_time,
        break_minutes: shift.break_minutes,
        total_hours: shift.total_hours,
      },
      adjusted: {
        start_time: body.adjusted_start_time,
        end_time: body.adjusted_end_time,
        break_minutes: adjBreak,
        total_hours: adjTotalHours,
      },
    };

    // Fail-closed + company_id assertion. Adjustment is a CORRECTION
    // in WLES v1 terms — the shift's recorded hours are changed.
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
    const unsealed = buildCorrection({
      actorId: userId,
      subjectId: shift.worker_id,
      timestamp: now.toISOString(),
      previousEventHash,
      shiftId,
      correctionReason: body.reason,
      changes: {
        original: eventData.original,
        adjusted: eventData.adjusted,
        method: eventData.method,
        layer: eventData.layer,
      },
    });
    const sealed = sealEvent(unsealed);
    await insertV1Event(
      supabase as unknown as Parameters<typeof insertV1Event>[0],
      sealed,
      {
        companyId: shift.company_id,
        workerId: shift.worker_id,
        siteId: shift.site_id ?? null,
        createdBy: userId,
        eventDataCompat: eventData,
      },
    );

    // Update shift with adjusted values + PAYROLL_APPROVED (adjustment implies final approval)
    await supabase
      .from('shifts')
      .update({
        start_time: body.adjusted_start_time,
        end_time: body.adjusted_end_time,
        break_minutes: adjBreak,
        total_hours: adjTotalHours.toFixed(2),
        status: 'PAYROLL_APPROVED',
        payroll_approved_by: userId,
        payroll_approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', shiftId);

    return NextResponse.json({
      success: true,
      shift_id: shiftId,
      status: 'PAYROLL_APPROVED',
      adjusted_total_hours: adjTotalHours,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
