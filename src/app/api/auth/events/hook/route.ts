// CRACK 203 — Auth event hook (Standard Webhooks + always-200 posture)
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

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { routeLogger } from '@/lib/logger';
import { verifySupabaseHookSignature } from './signature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request): Promise<Response> {
  const log = routeLogger('POST /api/auth/events/hook', req.headers.get('x-request-id'));

  // 1. Read raw body before any parsing (signature is over bytes).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    log.error({ err: String(e) }, 'auth.hook.body_read_failed');
    return NextResponse.json({ claims: {} });
  }

  // 2. Verify Standard Webhooks signature.
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  if (!verifySupabaseHookSignature(rawBody, svixId, svixTimestamp, svixSignature)) {
    log.warn({ hasSvixId: !!svixId, hasSig: !!svixSignature }, 'auth.hook.signature_invalid');
    // Always 200 — returning 4xx would block Supabase auth entirely.
    return NextResponse.json({ claims: {} });
  }

  // 3. Parse body.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    log.warn({ err: String(e) }, 'auth.hook.body_parse_failed');
    return NextResponse.json({ claims: {} });
  }

  const eventType = (body.event ?? body.type ?? 'unknown') as string;
  const user = (body.user ?? {}) as Record<string, unknown>;
  const supabaseEventId = (body.id as string | undefined) ?? null;

  // 4. Derive company_id by looking up the actor in admins then workers.
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
      log.warn({ err: String(e), actorUserId }, 'auth.hook.company_lookup_failed');
    }
  }

  // 5. Scrub PII from payload before storing.
  const safePayload = scrubPayload(body);

  // 6. Insert — ON CONFLICT (supabase_event_id) DO NOTHING for dedup.
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
        // Duplicate delivery — idempotent.
      } else {
        log.error({ err: error.message, eventType }, 'auth.hook.insert_failed');
      }
    } else {
      log.info({ eventType, actorUserId, companyId }, 'auth.hook.inserted');
    }
  } catch (e) {
    log.error({ err: String(e), eventType }, 'auth.hook.insert_exception');
  }

  // JWT Claims Hook passthrough — return existing claims unchanged.
  const claims = (body.claims ?? {}) as Record<string, unknown>;
  return NextResponse.json({ claims });
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
