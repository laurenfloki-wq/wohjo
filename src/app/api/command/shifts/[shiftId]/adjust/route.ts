// Flostruction Command — Adjust Hours
// POST /api/command/shifts/[shiftId]/adjust
// Adjusts hours and implicitly final-approves the shift.
// Creates WLES adjustment event with original and adjusted values + reason.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
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

    const { data: lastEvent } = await supabase
      .from('shift_events')
      .select('event_hash')
      .eq('worker_id', shift.worker_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const previousHash = lastEvent?.event_hash ?? null;

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
      created_by: userId,
    });

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
