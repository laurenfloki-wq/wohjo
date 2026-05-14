// Gate R-FOR-1 — internal auth_events emission helper.
//
// Server-side, service-role, fail-soft. Every route that handles
// an auth-surface event calls emitAuthEvent() to write a side-pipe
// row to public.auth_events. RLS bypasses via service-role grant
// per CRACK 106 migration; there is no INSERT policy for
// authenticated users.
//
// This emission is INDEPENDENT of the Standard Webhooks delivery
// at /api/auth/events/hook. Both paths can populate auth_events
// concurrently — the supabase_event_id UNIQUE column dedups when
// the external hook also fires; the internal path always sets
// supabase_event_id = null, so two rows (one internal, one
// external) coexist by design — distinct origin, distinct evidence.
//
// Failure modes are LOG-ONLY. Side-pipe writes must never gate the
// user-facing response (matches L2.1 chunk 2 posture).

import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';

export type InternalAuthEventType =
  | 'X-FLOSMOSIS-WORKER_BOOTSTRAP_LINKED'
  | 'X-FLOSMOSIS-WORKER_BOOTSTRAP_ALREADY_LINKED'
  | 'X-FLOSMOSIS-WORKER_BOOTSTRAP_NO_MATCH'
  | 'X-FLOSMOSIS-WORKER_BOOTSTRAP_CONFLICT'
  | 'X-FLOSMOSIS-WORKER_SHIFT_START_AUTHN'
  | 'X-FLOSMOSIS-WORKER_SHIFT_END_AUTHN'
  | 'X-FLOSMOSIS-ADMIN_SESSION_AUTHN'
  | 'X-FLOSMOSIS-SUPERVISOR_LOGIN_AUTHN'
  | 'X-FLOSMOSIS-MFA_CHALLENGE_ISSUED'
  | 'X-FLOSMOSIS-MFA_CHALLENGE_VERIFIED'
  | 'X-FLOSMOSIS-MFA_CHALLENGE_FAILED'
  | 'X-FLOSMOSIS-AUTH_SURFACE_UNKNOWN';

export interface EmitAuthEventInput {
  eventType: InternalAuthEventType;
  actorUserId: string | null;
  actorEmail?: string | null;
  actorPhone?: string | null;
  companyId: string | null;
  request: Request;
  // Free-form payload stored as jsonb in `payload`. Keep small (<2 KB) —
  // large blobs belong in shift_events.event_data, not here.
  payload?: Record<string, unknown>;
  // Pre-constructed Supabase service client. Optional; helper creates
  // its own if omitted. Pass-through allows callers to reuse a client
  // and avoid the cost of a fresh SDK initialisation per request.
  supabase?: ReturnType<typeof createServiceClient>;
}

function firstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  return forwardedFor.split(',')[0]?.trim() ?? null;
}

// Fire-and-forget side-pipe write. Never throws. Caller responsibility:
// pass a fresh-enough `request` so the Vercel edge headers
// (x-forwarded-for, x-vercel-ip-country, user-agent) are still on the
// in-memory Request object.
export async function emitAuthEvent(log: Logger, input: EmitAuthEventInput): Promise<void> {
  try {
    const supabase = input.supabase ?? createServiceClient();
    const { error } = await supabase.from('auth_events').insert({
      occurred_at: new Date().toISOString(),
      event_type: input.eventType,
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail ?? null,
      actor_phone: input.actorPhone ?? null,
      company_id: input.companyId,
      ip_address: firstIp(input.request.headers.get('x-forwarded-for')),
      ip_country: input.request.headers.get('x-vercel-ip-country') ?? null,
      user_agent: (input.request.headers.get('user-agent') ?? '').slice(0, 256) || null,
      payload: input.payload ?? {},
      supabase_event_id: null, // internal emission never carries a Supabase id
      // event_hash / previous_event_hash: NULL per pack §3 Option A
    });
    if (error) {
      log.warn(
        {
          err: error.message,
          eventType: input.eventType,
          actorUserId: input.actorUserId,
        },
        'auth_events.internal_emit_failed',
      );
      return;
    }
    log.info(
      {
        eventType: input.eventType,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
      },
      'auth_events.internal_emit',
    );
  } catch (e) {
    log.warn(
      {
        err: e instanceof Error ? e.message : 'unknown',
        eventType: input.eventType,
      },
      'auth_events.internal_emit_exception',
    );
  }
}
