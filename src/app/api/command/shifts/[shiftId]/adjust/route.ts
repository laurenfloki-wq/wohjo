// Flostruction Command — Adjust Hours
// POST /api/command/shifts/[shiftId]/adjust
// Adjusts hours and implicitly final-approves the shift.
// Creates WLES adjustment event with original and adjusted values + reason.
//
// CP-1 slice 2b (2026-06-10): unscoped shift read became the
// shiftAuthLookup seam (id+company_id only); originals are re-read
// post-membership via shiftsMutationRepo(companyId); chain-tail and the
// .eq('id')-only UPDATE relocated verbatim. Behaviour unchanged.

import { NextResponse } from 'next/server';
import { generateEventHash } from '@/lib/wles/hash';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
// MON-3 — reuse the canonical clock-off bounds so an admin adjustment can't
// final-approve a zero-hour shift or an out-of-range break (which would fail
// the whole pay-run export batch downstream).
import {
  VALID_BREAK_MINUTES,
  MIN_SHIFT_HOURS,
  MAX_SHIFT_HOURS,
} from '@/lib/field/shift-state-machine';
import {
  shiftAuthLookup,
  workerChainTail,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';

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

    // SEAM: unscoped auth lookup (id + company_id only).
    const { data: authRow, error: authErr } = await shiftAuthLookup(shiftId);
    if (authErr || !authRow) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // GAP-A3-001 closure + CRACK 218 audit fix: derive admin auth.users UUID
    // from the session rather than trusting the client.
    let userId: string;
    try {
      ({ userId } = await requireCompanyMembership(log, authRow.company_id));
    } catch (err) {
      return authErrorResponse(err);
    }

    const repo = shiftsMutationRepo(authRow.company_id);
    const evRepo = shiftEventsMutationRepo(authRow.company_id);

    // Post-membership re-read (originals for the adjustment event).
    const { data: shift, error: shiftError } = await repo.getForAdjust(shiftId);
    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const now = new Date();

    // Calculate adjusted total hours
    const adjStart = new Date(body.adjusted_start_time);
    const adjEnd = new Date(body.adjusted_end_time);
    const adjBreak = body.adjusted_break_minutes ?? 0;

    // MON-3 — break must be a canonical value (matches worker clock-off).
    if (!(VALID_BREAK_MINUTES as readonly number[]).includes(adjBreak)) {
      return NextResponse.json(
        { error: `Adjusted break must be one of ${VALID_BREAK_MINUTES.join(', ')} minutes.` },
        { status: 400 },
      );
    }

    const adjTotalHoursRaw =
      (adjEnd.getTime() - adjStart.getTime()) / (1000 * 60 * 60) - adjBreak / 60;
    const adjTotalHours = Math.round(Math.max(0, adjTotalHoursRaw) * 100) / 100;

    // MON-3 — enforce the same min/max as clock-off. A zero-hour adjustment must
    // NOT be approvable: it would later fail the entire pay-run export batch.
    if (adjTotalHours < MIN_SHIFT_HOURS || adjTotalHours > MAX_SHIFT_HOURS) {
      return NextResponse.json(
        {
          error: `Adjusted hours must be between ${MIN_SHIFT_HOURS} and ${MAX_SHIFT_HOURS}. Check the adjusted start/end times and break — a zero-hour adjustment can't be approved.`,
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

    const { data: lastEvent } = await workerChainTail(shift.worker_id);

    const previousHash = (lastEvent as { event_hash: string } | null)?.event_hash ?? null;

    const hash = generateEventHash({
      company_id: authRow.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: eventData,
      created_at: now,
    });

    await evRepo.insertV0Event({
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
    await repo.updateAfterAdjust(shiftId, {
      start_time: body.adjusted_start_time,
      end_time: body.adjusted_end_time,
      break_minutes: adjBreak,
      total_hours: adjTotalHours.toFixed(2),
      status: 'PAYROLL_APPROVED',
      payroll_approved_by: userId,
      payroll_approved_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

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
