// CRACK 203 — Auth event hook (Standard Webhooks + always-200 posture)
// Phase 8 observability hardening — see README.md in this directory.
// Mounted at: /api/auth/events/hook
//
// Supabase fires this endpoint as a Custom Access Token Hook (JWT Claims Hook)
// on every auth event. The hook MUST return 200; any non-200 causes Supabase
// to abort sign-in entirely.
//
// Protocol: Standard Webhooks (https://www.standardwebhooks.com/)
//   Headers: svix-id, svix-timestamp, svix-signature
//   Signed message: "<svix-id>.<svix-timestamp>.<raw-body>"
//   Secret: SUPABASE_HOOK_SECRET = "v1,whsec_<base64>"
//
// Response on success:
//   {"claims": <passthrough>} — JWT Claims Hook passthrough
//
// Failure posture: ALWAYS return 200. Log at ERROR; never block auth.
//
// Idempotency: supabase_event_id UNIQUE + ON CONFLICT DO NOTHING.
//
// Observability: every exit path emits a structured log with:
//   - duration_ms  (wall-clock from request receipt to response)
//   - outcome      (received | signature_failure | stale_timestamp |
//                   body_read_failure | body_parse_failure |
//                   duplicate_delivery | insert_failure | ok)
//   - errorType    (only on non-ok outcomes; queryable in Vercel Logs)

import { NextResponse } from 'next/server';
// W5 (2026-06-11) — chokepoint sweep: this svix-signature-gated
// Supabase Auth webhook built its own supabase-js client (invisible
// to the confinement guard). SYSTEM surface — cross-company by design.
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';
import { verifySupabaseHookSignature } from './signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Replay-protection window: reject deliveries with a svix-timestamp more
// than 5 minutes old (per Standard Webhooks recommendation). The hook
// still returns 200 to avoid blocking auth; the delivery is logged and
// silently dropped.
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

function getServiceSupabase() {
  // Nominal cast only — both clients are supabase-js under the hood.
  return getServiceClientForSystemJob() as unknown as import('@supabase/supabase-js').SupabaseClient;
}

export async function POST(req: Request): Promise<Response> {
  const startMs = Date.now();
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  const requestId = req.headers.get('x-request-id');

  const log = routeLogger('POST /api/auth/events/hook', requestId);

  // Entry log — correlation point for Supabase delivery logs.
  log.info({ svixId, svixTimestamp, hasSig: !!svixSignature }, 'auth.hook.received');

  function respond(claims: Record<string, unknown>, outcome: string, errorType?: string) {
    const duration_ms = Date.now() - startMs;
    if (errorType) {
      log.warn({ svixId, outcome, errorType, duration_ms }, 'auth.hook.exit');
    } else {
      log.info({ svixId, outcome, duration_ms }, 'auth.hook.exit');
    }
    return NextResponse.json({ claims });
  }

  // 1. Read raw body before any parsing (signature is over bytes).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    log.error({ svixId, err: String(e) }, 'auth.hook.body_read_failed');
    return respond({}, 'body_read_failure', 'BODY_READ_FAILURE');
  }

  // 2. Replay protection — reject deliveries with stale timestamps.
  if (svixTimestamp) {
    const deliveryMs = parseInt(svixTimestamp, 10) * 1000;
    if (Math.abs(Date.now() - deliveryMs) > MAX_TIMESTAMP_AGE_MS) {
      log.warn({ svixId, svixTimestamp }, 'auth.hook.stale_timestamp');
      return respond({}, 'stale_timestamp', 'STALE_TIMESTAMP');
    }
  }

  // 3. Verify Standard Webhooks signature.
  if (!verifySupabaseHookSignature(rawBody, svixId, svixTimestamp, svixSignature)) {
    log.warn({ svixId, hasSvixId: !!svixId, hasSig: !!svixSignature }, 'auth.hook.signature_invalid');
    return respond({}, 'signature_failure', 'SIGNATURE_FAILURE');
  }

  // 4. Parse body.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    log.warn({ svixId, err: String(e) }, 'auth.hook.body_parse_failed');
    return respond({}, 'body_parse_failure', 'BODY_PARSE_FAILURE');
  }

  const eventType = (body.event ?? body.type ?? 'unknown') as string;
  const user = (body.user ?? {}) as Record<string, unknown>;
  const supabaseEventId = (body.id as string | undefined) ?? null;

  // 5. Derive company_id by looking up the actor in admins then workers.
  let companyId: string | null = null;
  const actorUserId = (user.id as string | undefined) ?? null;
  if (actorUserId) {
    try {
      const supabase = getServiceSupabase();
      const { data: admin } = await supabase
        .from('admins')
        .select('company_id')
        .eq('user_id', actorUserId)
        .maybeSingle();
      if (admin?.company_id) {
        companyId = admin.company_id as string;
      } else {
        const { data: worker } = await supabase
          .from('workers')
          .select('company_id')
          .eq('user_id', actorUserId)
          .maybeSingle();
        companyId = (worker?.company_id as string | undefined) ?? null;
      }
    } catch (e) {
      log.warn({ svixId, err: String(e), actorUserId }, 'auth.hook.company_lookup_failed');
    }
  }

  // 6. Scrub PII from payload before storing.
  const safePayload = scrubPayload(body);

  // 7. Insert — ON CONFLICT (supabase_event_id) DO NOTHING for dedup.
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from('auth_events').insert({
      occurred_at: (body.occurred_at as string | undefined) ?? new Date().toISOString(),
      event_type: eventType,
      actor_user_id: actorUserId,
      actor_email: (user.email as string | undefined) ?? null,
      actor_phone: null,
      company_id: companyId,
      ip_address: firstIp(req.headers.get('x-forwarded-for')),
      ip_country: req.headers.get('x-vercel-ip-country') ?? null,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 256) || null,
      payload: safePayload,
      supabase_event_id: supabaseEventId,
    });

    if (error) {
      if (error.code === '23505') {
        // Duplicate delivery — idempotent; supabase_event_id already exists.
        log.info({ svixId, supabaseEventId, eventType }, 'auth.hook.duplicate_delivery');
        const claims = (body.claims ?? {}) as Record<string, unknown>;
        return respond(claims, 'duplicate_delivery');
      }
      log.error({ svixId, err: error.message, errorCode: error.code, eventType }, 'auth.hook.insert_failed');
      const claims = (body.claims ?? {}) as Record<string, unknown>;
      return respond(claims, 'insert_failure', 'INSERT_FAILURE');
    }

    log.info({ svixId, eventType, actorUserId, companyId, supabaseEventId }, 'auth.hook.inserted');
  } catch (e) {
    log.error({ svixId, err: String(e), eventType }, 'auth.hook.insert_exception');
  }

  // JWT Claims Hook passthrough — return existing claims unchanged.
  const claims = (body.claims ?? {}) as Record<string, unknown>;
  return respond(claims, 'ok');
}

function firstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  return forwardedFor.split(',')[0]?.trim() ?? null;
}

function scrubPayload(body: Record<string, unknown>): Record<string, unknown> {
  const scrubbed = { ...body };
  const user = scrubbed.user as Record<string, unknown> | undefined;
  if (user) {
    scrubbed.user = {
      ...user,
      phone: undefined,
      recovery_sent_at: undefined,
      confirmation_token: undefined,
      recovery_token: undefined,
      email_change_token_new: undefined,
      email_change_token_current: undefined,
    };
  }
  return scrubbed;
}
