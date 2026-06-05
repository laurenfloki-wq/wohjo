// CRACK 195 — /api/worker/disputes
//
// POST — file a new dispute + write X-FLOSMOSIS-WORKER_DISPUTE_FILED to
//         shift_events (WLES v1.0 sealed; spec_version='1.0').
//
// GET  — list the authenticated worker's own disputes.
//
// Both routes require a worker session. POST also requires an active
// DISPUTE_NEW MFA grant (minted at /api/worker/mfa/verify).
//
// Post-cutover (2026-06-04T02:56:50Z) the substrate blocks spec_version='0'
// inserts via shift_events_post_cutover_spec_v1. Route fails closed if
// WLES_V1_ENABLED is missing.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { assertActiveGrant } from '@/lib/auth/worker-mfa';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildWorkerDisputeFiled } from '@/lib/wles/v1-translate';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';

const DisputeSchema = z.object({
  dispute_type: z.enum([
    'hours_disputed',
    'pay_rate_wrong',
    'records_missing',
    'fake_gps_suspected',
    'supervisor_misconduct',
    'company_cancelled_records_access',
    'data_correction_request',
    'other',
  ]),
  narrative: z.string().trim().min(10, 'narrative too short').max(8000, 'narrative too long'),
  related_shift_id: z.string().uuid().optional(),
});

// ─── POST ─────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const log = routeLogger('POST /api/worker/disputes', request.headers.get('x-request-id'));
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    const ip = getClientIP(request);
    const rl = checkRateLimit(`worker-dispute-new:${identity.workerId}`, {
      windowMs: 60 * 60 * 1000,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      log.warn({ workerId: identity.workerId }, 'worker.dispute.rate_limited');
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'RATE_LIMITED', retry_after_seconds: retryAfter },
        { status: 429 },
      );
    }
    void ip;

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = DisputeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { dispute_type, narrative, related_shift_id } = parsed.data;

    // MFA gate — DISPUTE_NEW grant required.
    await assertActiveGrant(log, identity.workerId, 'DISPUTE_NEW');

    const supabase = createServiceClient();
    const now = new Date();

    // Resolve site_id for the chain event. If a related shift is provided,
    // prefer that shift's site. Otherwise fall back to primary_site_id.
    let siteId: string | null = null;
    if (related_shift_id) {
      const { data: shiftRow } = await supabase
        .from('shifts')
        .select('site_id, company_id')
        .eq('id', related_shift_id)
        .maybeSingle();
      siteId = (shiftRow as { site_id?: string | null } | null)?.site_id ?? null;
    }
    if (!siteId) {
      const { data: workerRow } = await supabase
        .from('workers')
        .select('primary_site_id')
        .eq('id', identity.workerId)
        .maybeSingle();
      siteId = (workerRow as { primary_site_id?: string | null } | null)?.primary_site_id ?? null;
    }

    // Insert dispute record.
    const { data: dispute, error: disputeErr } = await supabase
      .from('worker_disputes')
      .insert({
        worker_id: identity.workerId,
        company_id: identity.companyId,
        dispute_type,
        narrative,
        related_shift_id: related_shift_id ?? null,
        status: 'open',
      })
      .select('id, created_at')
      .single();
    if (disputeErr || !dispute) {
      log.error({ err: disputeErr?.message }, 'worker.dispute.insert_failed');
      return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
    }
    const disputeId = (dispute as { id: string }).id;

    const eventData: Record<string, unknown> = {
      dispute_id: disputeId,
      dispute_type,
      ...(related_shift_id ? { related_shift_id } : {}),
    };

    // Fail-closed + company_id assertion.
    if (!isWlesV1Enabled()) {
      log.error({ disputeId }, 'worker.dispute.wles_v1_disabled');
      // Dispute row is durable; surface the event-sealing failure but
      // don't roll back the worker's dispute.
      return NextResponse.json(
        { ok: true, dispute_id: disputeId, event_id: null, event_sealing_error: 'WLES_V1_DISABLED' },
        { status: 201 },
      );
    }
    if (!identity.companyId) {
      log.error({ disputeId }, 'worker.dispute.missing_company_id');
      return NextResponse.json(
        { ok: true, dispute_id: disputeId, event_id: null, event_sealing_error: 'MISSING_COMPANY_ID' },
        { status: 201 },
      );
    }

    let eventId: string | null = null;
    try {
      const previousEventHash = await getV1ChainTail(
        supabase as unknown as Parameters<typeof getV1ChainTail>[0],
        identity.companyId,
      );
      const unsealed = buildWorkerDisputeFiled({
        actorId: identity.userId ?? identity.workerId,
        subjectId: identity.workerId,
        timestamp: now.toISOString(),
        previousEventHash,
        disputeId,
        disputeType: dispute_type,
        relatedShiftId: related_shift_id ?? null,
      });
      const sealed = sealEvent(unsealed);
      const result = await insertV1Event(
        supabase as unknown as Parameters<typeof insertV1Event>[0],
        sealed,
        {
          companyId: identity.companyId,
          workerId: identity.workerId,
          siteId: siteId ?? null,
          createdBy: identity.userId ?? identity.workerId,
          eventDataCompat: eventData,
          eventTypeForSubstrate: 'WORKER_DISPUTE_FILED',
        },
      );
      eventId = result.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, disputeId }, 'worker.dispute.event_insert_failed');
      // Dispute is durable; event failure is non-fatal — log and continue.
    }

    log.info({ workerId: identity.workerId, disputeId, eventId }, 'worker.dispute.filed');

    return NextResponse.json(
      { ok: true, dispute_id: disputeId, event_id: eventId },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    log.error({ err: msg }, 'worker.dispute.unhandled');
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}

// ─── GET ──────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const log = routeLogger('GET /api/worker/disputes', request.headers.get('x-request-id'));
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('worker_disputes')
      .select(
        'id, dispute_type, narrative, related_shift_id, status, resolution_notes, resolved_at, created_at, updated_at',
      )
      .eq('worker_id', identity.workerId)
      .order('created_at', { ascending: false });

    if (error) {
      log.error({ err: error.message }, 'worker.dispute.list_failed');
      return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
    }

    return NextResponse.json({ disputes: data ?? [] }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    log.error({ err: msg }, 'worker.dispute.list.unhandled');
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
