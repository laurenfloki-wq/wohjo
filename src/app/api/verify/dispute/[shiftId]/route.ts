// Flostruction Verify — Dispute/Query Shift via Web Interface
// POST /api/verify/dispute/[shiftId]
// Creates WLES DISPUTE_RAISED event with method: 'WOHJO_VERIFY'
//
// Day-7 P0-3 security patch (2026-04-23):
//   Previously accepted `supervisor_id` from POST body with no token
//   verification — allowed forged WLES DISPUTE_RAISED events.
//   Now requires `verify_token` in body. supervisor_id is derived
//   server-side from the matched row; body-supplied supervisor_id is
//   ignored. Rate-limited.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import { notifyPayrollDispute } from '@/lib/email/notify';
import { sendWorkerDisputeSms } from '@/lib/sms/worker-notify';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

// CREDENTIAL REQUIRED: RESEND_API_KEY

const MAX_REASON_LENGTH = 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('POST /api/verify/dispute/:shiftId', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Rate limit.
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`verify.dispute:${clientIP}`, RATE_LIMITS.AUTH);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { shiftId } = await params;
    const body = await request.json() as {
      verify_token?: string;
      reason?: string;
      // Body-supplied supervisor_id/phone are NOT trusted. Server
      // derives all supervisor identity from verify_token.
      supervisor_id?: unknown;
      supervisor_phone?: unknown;
    };

    if (!shiftId) {
      return NextResponse.json({ error: 'shiftId required' }, { status: 400 });
    }
    if (!body.verify_token || typeof body.verify_token !== 'string') {
      return NextResponse.json(
        { error: 'verify_token required', code: 'MISSING_TOKEN' },
        { status: 401 },
      );
    }
    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason required' }, { status: 400 });
    }
    const reason = body.reason.trim().slice(0, MAX_REASON_LENGTH);

    const supabase = createServiceClient();

    // Resolve supervisor via token (sole trust anchor).
    const { data: supervisor, error: supError } = await supabase
      .from('supervisors')
      .select('id, company_id, name, phone, site_ids, is_active')
      .eq('verify_token', body.verify_token)
      .eq('is_active', true)
      .maybeSingle();

    if (supError || !supervisor) {
      log.warn({ ip: clientIP, shiftId }, 'verify.dispute.invalid_token');
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const supervisorId = supervisor.id as string;
    const supervisorPhone = supervisor.phone as string;

    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status')
      .eq('id', shiftId)
      .single();

    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Idempotency: if already disputed, don't write a second event.
    if (shift.status === 'DISPUTED') {
      return NextResponse.json({ error: 'Shift is already disputed', code: 'ALREADY_DISPUTED' }, { status: 409 });
    }

    const { data: worker } = await supabase
      .from('workers')
      .select('first_name, last_name')
      .eq('id', shift.worker_id)
      .single();

    const { data: site } = await supabase
      .from('sites')
      .select('name')
      .eq('id', shift.site_id)
      .single();

    // Access guard — token-matched supervisor must own this site.
    const supervisorSiteIds = (supervisor.site_ids as string[]) ?? [];
    if (!supervisorSiteIds.includes(shift.site_id)) {
      log.warn(
        { supervisorId, shiftId, shiftSite: shift.site_id },
        'verify.dispute.site_access_denied',
      );
      return NextResponse.json(
        { error: 'Supervisor does not have access to this site' },
        { status: 403 },
      );
    }

    const now = new Date();

    // Create WLES DISPUTE_RAISED event with server-derived identity.
    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'WOHJO_VERIFY' as const,
      reason,
      created_by: supervisorPhone,
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
      event_type: 'DISPUTE_RAISED',
      event_data: eventData,
      created_at: now,
    });

    const { error: eventError } = await supabase.from('shift_events').insert({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'DISPUTE_RAISED',
      event_data: eventData,
      device_metadata: {},
      event_hash: hash,
      previous_event_hash: previousHash,
      created_at: now.toISOString(),
      created_by: supervisorPhone,
    });

    if (eventError) {
      log.error({ err: eventError.message, shiftId }, 'verify.dispute.event_insert_failed');
      return NextResponse.json(
        { error: 'Could not record dispute event' },
        { status: 500 },
      );
    }

    // Update shift status (compound predicate guards against race).
    const { error: updateError } = await supabase
      .from('shifts')
      .update({
        status: 'DISPUTED',
        updated_at: now.toISOString(),
      })
      .eq('id', shiftId)
      .neq('status', 'DISPUTED');

    if (updateError) {
      log.error({ err: updateError.message, shiftId }, 'verify.dispute.shift_update_failed');
      return NextResponse.json(
        { error: 'Dispute event recorded but shift state did not update. Please retry.' },
        { status: 500 },
      );
    }

    // Notify payroll admin (urgent).
    const { data: company } = await supabase
      .from('companies')
      .select('contact_email')
      .eq('id', shift.company_id)
      .single();

    if (company?.contact_email) {
      try {
        await notifyPayrollDispute({
          to: company.contact_email,
          supervisorName: (supervisor.name as string) ?? 'Supervisor',
          workerName: `${worker?.first_name ?? 'Unknown'} ${worker?.last_name ?? ''}`.trim(),
          site: site?.name ?? 'Unknown',
          hours: parseFloat(shift.total_hours ?? '0'),
          method: 'WOHJO_VERIFY',
          reason,
        });
      } catch {
        // Email failure does not block dispute
      }
    }

    // Notify worker via SMS — fire and forget; SMS failure must never
    // roll back the DISPUTE_RAISED event. Per
    // labour-hire-workflow-gap-analysis-2026-04-29 §2.7, web-based
    // dispute previously did not notify the worker; this closes the
    // gap so the worker SMS pattern is consistent across approval and
    // dispute paths.
    void sendWorkerDisputeSms(
      {
        id: shift.id as string,
        worker_id: shift.worker_id as string,
        receipt_id: shift.receipt_id as string,
        total_hours: (shift.total_hours as string | null) ?? null,
      },
      reason,
    ).catch((err) => {
      log.warn(
        { err: err instanceof Error ? err.message : 'unknown', shiftId },
        'verify.dispute.worker_sms_failed',
      );
    });

    log.info({ shiftId, supervisorId }, 'verify.dispute.completed');

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
