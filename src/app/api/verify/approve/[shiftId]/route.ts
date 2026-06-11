// Flostruction Verify — Approve Shift via Web Interface
// POST /api/verify/approve/[shiftId]
// Creates WLES SUPERVISOR_APPROVAL event with method: 'WOHJO_VERIFY'
// Same downstream effects as SMS approval.
//
// Day-7 P0-2 security patch (2026-04-23):
//   Previously accepted `supervisor_id` from POST body with no token
//   verification — allowed forged WLES SUPERVISOR_APPROVAL events.
//   Now requires `verify_token` in body. supervisor_id is derived
//   server-side from the matched row; body-supplied supervisor_id
//   is ignored. Rate-limited.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): token-anchored repositories replace the raw
// client. verifyShiftLookup is fetch-then-authorize — the site-access
// guard below MUST run before any mutation trusts the row.
import {
  supervisorForApprove,
  verifyShiftLookup,
  workerNameById,
  siteNameById,
  companyContactEmail,
} from '@/lib/db/repositories/verify.repo';
import {
  shiftsMutationRepo,
  shiftEventsMutationRepo,
  workerChainTail,
} from '@/lib/db/repositories/shifts.repo';
import { clearPendingSmsApproval } from '@/lib/db/repositories/supervisors.repo';
import { generateEventHash } from '@/lib/wles/hash';
import { notifyPayrollAdmin } from '@/lib/email/notify';
import { sendWorkerApprovedSms } from '@/lib/sms/worker-notify';
import { getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { routeLogger } from '@/lib/logger';

// CREDENTIAL REQUIRED: RESEND_API_KEY

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('POST /api/verify/approve/:shiftId', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Rate limit.
  const clientIP = getClientIP(request);
  const rl = await checkRateLimitDurable(`verify.approve:${clientIP}`, RATE_LIMITS.AUTH);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { shiftId } = await params;
    const body = await request.json() as {
      verify_token?: string;
      // NOTE: `supervisor_id` / `supervisor_phone` from body are NOT
      // trusted. They may appear in the request from legacy clients
      // but the server derives all supervisor identity from the token.
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

    // Resolve supervisor via token. This is the only trust anchor.
    const { data: supervisor, error: supError } = await supervisorForApprove(body.verify_token);

    if (supError || !supervisor) {
      log.warn({ ip: clientIP, shiftId }, 'verify.approve.invalid_token');
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const supervisorId = supervisor.id as string;

    // Fetch shift with worker + site info (fetch-then-authorize — the
    // site-access guard below must run before any mutation).
    const { data: shift, error: shiftError } = await verifyShiftLookup(shiftId);

    if (shiftError || !shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.status !== 'SUBMITTED') {
      return NextResponse.json({ error: `Shift status is ${shift.status}, not SUBMITTED` }, { status: 409 });
    }

    const { data: worker } = await workerNameById(shift.worker_id);

    const { data: site } = await siteNameById(shift.site_id);

    // Access guard — the token-matched supervisor must own this site.
    const supervisorSiteIds = (supervisor.site_ids as string[]) ?? [];
    if (!supervisorSiteIds.includes(shift.site_id)) {
      log.warn(
        { supervisorId, shiftId, shiftSite: shift.site_id },
        'verify.approve.site_access_denied',
      );
      return NextResponse.json(
        { error: 'Supervisor does not have access to this site' },
        { status: 403 },
      );
    }

    const now = new Date();

    // Scoped repositories (W1.4): bound to the verified shift's company
    // (site-access guard has run).
    const repo = shiftsMutationRepo(shift.company_id);
    const evRepo = shiftEventsMutationRepo(shift.company_id);

    // Create WLES SUPERVISOR_APPROVAL event.
    // approver_phone is taken from the token-matched supervisor's row,
    // NEVER from the request body.
    const supervisorPhone = supervisor.phone as string;
    const eventData = {
      shift_id: shiftId,
      receipt_id: shift.receipt_id,
      method: 'WOHJO_VERIFY' as const,
      approver_phone: supervisorPhone,
    };

    const { data: lastEvent } = await workerChainTail(shift.worker_id);

    const previousHash = lastEvent?.event_hash ?? null;

    const hash = generateEventHash({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: eventData,
      created_at: now,
    });

    const { error: eventError } = await evRepo.insertV0Event({
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: 'SUPERVISOR_APPROVAL',
      event_data: eventData,
      device_metadata: {},
      event_hash: hash,
      previous_event_hash: previousHash,
      created_at: now.toISOString(),
      created_by: supervisorPhone,
    });

    if (eventError) {
      log.error({ err: eventError.message, shiftId }, 'verify.approve.event_insert_failed');
      return NextResponse.json(
        { error: 'Could not record approval event' },
        { status: 500 },
      );
    }

    // Update shift status.
    const { error: updateError } = await repo.approveFromVerify(shiftId, {
        status: 'SUPERVISOR_APPROVED',
        supervisor_approved_by: supervisorId,
        supervisor_approved_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

    if (updateError) {
      log.error({ err: updateError.message, shiftId }, 'verify.approve.shift_update_failed');
      return NextResponse.json(
        { error: 'Approval event recorded but shift state did not update. Please retry.' },
        { status: 500 },
      );
    }

    // Remove the receipt-code from supervisor's pending SMS list.
    const existingPending = (supervisor.pending_sms_approval_ids as string[] | null) ?? [];
    if (existingPending.length > 0) {
      const code = (shift.receipt_id as string).slice(-6);
      const remaining = existingPending.filter((c) => c !== code);
      await clearPendingSmsApproval(supervisorId, remaining);
    }

    // Notify payroll admin via Resend.
    const { data: company } = await companyContactEmail(shift.company_id);

    if (company?.contact_email) {
      try {
        await notifyPayrollAdmin({
          to: company.contact_email,
          supervisorName: (supervisor.name as string) ?? 'Supervisor',
          method: 'WOHJO_VERIFY',
          shifts: [{
            workerName: `${worker?.first_name ?? 'Unknown'} ${worker?.last_name ?? ''}`.trim(),
            site: site?.name ?? 'Unknown',
            hours: parseFloat(shift.total_hours ?? '0'),
            date: shift.shift_date,
          }],
        });
      } catch {
        // Email failure does not block approval
      }
    }

    // Notify worker via SMS — fire and forget; SMS failure must never
    // roll back the SUPERVISOR_APPROVAL event. Per
    // labour-hire-workflow-gap-analysis-2026-04-29 §2.6, web-based
    // approval previously did not notify the worker; this closes the
    // gap so the worker SMS pattern is consistent across SMS-reply,
    // /verify, and /command approval entry points.
    void sendWorkerApprovedSms(
      {
        id: shift.id as string,
        worker_id: shift.worker_id as string,
        receipt_id: shift.receipt_id as string,
        total_hours: (shift.total_hours as string | null) ?? null,
      },
      now,
      (supervisor.name as string) ?? 'Supervisor',
    ).catch((err) => {
      log.warn(
        { err: err instanceof Error ? err.message : 'unknown', shiftId },
        'verify.approve.worker_sms_failed',
      );
    });

    log.info({ shiftId, supervisorId }, 'verify.approve.completed');

    return NextResponse.json({
      success: true,
      shift_id: shiftId,
      status: 'SUPERVISOR_APPROVED',
      method: 'WOHJO_VERIFY',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
