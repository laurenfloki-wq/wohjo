// CRACK 195 — /api/worker/disputes
//
// POST — file a new dispute + write WORKER_DISPUTE_FILED to shift_events
//         (WLES hash chain, spec_version='0').
//
// GET  — list the authenticated worker's own disputes.
//
// Both routes require a worker session. POST also requires an active
// DISPUTE_NEW MFA grant (minted at /api/worker/mfa/verify).
//
// Differences from the older /api/worker/disputes/new:
//   - This route writes a WORKER_DISPUTE_FILED shift_event with hash chain
//     linkage, making the dispute durable in the WLES audit substrate.
//   - Uses requireWorkerIdentity() for unified worker-session auth.

import { NextResponse } from 'next/server';
import { z } from 'zod';
// W1.4 (2026-06-10): scoped repositories replace the raw client.
import { workerSelfRepo } from '@/lib/db/repositories/workers.repo';
import { workerDisputesRepo } from '@/lib/db/repositories/disputes.repo';
import {
  insertWorkerDisputeEvent,
  disputeShiftLookup,
  disputeChainTail,
} from '@/lib/db/repositories/shifts.repo';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { assertActiveGrant } from '@/lib/auth/worker-mfa';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { generateEventHash } from '@/lib/wles/hash';

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

    // Scoped repositories (W1.4): worker + company from the verified
    // session identity.
    const dRepo = workerDisputesRepo(identity.workerId, identity.companyId);
    const now = new Date();

    // Resolve site_id for the chain event. If a related shift is provided,
    // prefer that shift's site. Otherwise fall back to primary_site_id.
    let siteId: string | null = null;
    if (related_shift_id) {
      // W2 (2026-06-11): lookup is tenant-scoped — cross-tenant ids
      // fall through to the primary-site fallback.
      const { data: shiftRow } = await disputeShiftLookup(related_shift_id, identity.companyId);
      siteId = (shiftRow as { site_id?: string | null } | null)?.site_id ?? null;
    }
    if (!siteId) {
      const { data: workerRow } = await workerSelfRepo(identity.workerId).getPrimarySiteId();
      siteId = (workerRow as { primary_site_id?: string | null } | null)?.primary_site_id ?? null;
    }

    // Insert dispute record.
    const { data: dispute, error: disputeErr } = await dRepo.insertDispute({
        dispute_type,
        narrative,
        related_shift_id: related_shift_id ?? null,
        status: 'open',
      });
    if (disputeErr || !dispute) {
      log.error({ err: disputeErr?.message }, 'worker.dispute.insert_failed');
      return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
    }
    const disputeId = (dispute as { id: string }).id;

    // Fetch last event for this worker to anchor the hash chain.
    const { data: lastEvt } = await disputeChainTail(identity.workerId);
    const prior = lastEvt as { id: string; event_hash: string } | null;

    const eventData: Record<string, unknown> = {
      dispute_id: disputeId,
      dispute_type,
      ...(related_shift_id ? { related_shift_id } : {}),
    };

    const eventHash = generateEventHash({
      company_id: identity.companyId ?? '',
      worker_id: identity.workerId,
      site_id: siteId ?? '',
      event_type: 'WORKER_DISPUTE_FILED',
      event_data: eventData,
      created_at: now,
    });

    const { data: evtRow, error: evtErr } = await insertWorkerDisputeEvent(identity.companyId, {
        worker_id: identity.workerId,
        site_id: siteId,
        event_type: 'WORKER_DISPUTE_FILED',
        event_data: eventData,
        device_metadata: {},
        event_hash: eventHash,
        previous_event_hash: prior?.event_hash ?? null,
        parent_shift_event_id: prior?.id ?? null,
        spec_version: '0',
        created_at: now.toISOString(),
        created_by: identity.userId,
      });

    if (evtErr) {
      log.error({ err: evtErr.message, disputeId }, 'worker.dispute.event_insert_failed');
      // Dispute is durable; event failure is non-fatal — log and continue.
      // The dispute row itself is the source of truth for the worker.
    }

    const eventId = evtRow ? (evtRow as { id: string }).id : null;

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

    const { data, error } = await workerDisputesRepo(
      identity.workerId,
      identity.companyId,
    ).listMine();

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
