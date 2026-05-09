// CRACK 106 — Auth event audit hook
// Mounted at: /api/auth/events/hook
//
// Supabase calls this endpoint on every auth event (sign_in, sign_up,
// sign_out, token_refresh, etc.). We insert a row into public.auth_events
// so FLOSMOSIS owns the audit trail rather than depending on Supabase's
// Logflare stream.
//
// Signature: HMAC-SHA256 of the raw request body, sent in the
// x-supabase-signature header. Shared secret = SUPABASE_HOOK_SECRET.
//
// Failure posture: always return 200. Auth must not be blocked by our
// audit layer being down. Log failures at ERROR so they page.
//
// Idempotency: supabase_event_id UNIQUE constraint + ON CONFLICT DO NOTHING.
// Supabase delivers at-least-once; duplicate delivery is transparent.

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
    log.warn({ err: String(e) }, 'auth.hook.body_read_failed');
    return NextResponse.json({ ok: true }); // don't block auth
  }

  // 2. Verify HMAC-SHA256 signature.
  const sig = req.headers.get('x-supabase-signature');
  if (!verifySupabaseHookSignature(rawBody, sig)) {
    log.warn({ hasSig: !!sig }, 'auth.hook.signature_invalid');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 3. Parse body.
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    log.warn({ err: String(e) }, 'auth.hook.body_parse_failed');
    return NextResponse.json({ ok: true });
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
      // Non-fatal: insert event without company_id.
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
      actor_phone: null, // never store phone in audit log (PII)
      company_id: companyId,
      ip_address: firstIp(req.headers.get('x-forwarded-for')),
      ip_country: req.headers.get('x-vercel-ip-country') ?? null,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 256) || null,
      payload: safePayload,
      supabase_event_id: supabaseEventId,
    });

    if (error) {
      if (error.code === '23505') {
        // Duplicate delivery — idempotent; treat as success.
        return NextResponse.json({ ok: true });
      }
      log.error({ err: error.message, eventType }, 'auth.hook.insert_failed');
    } else {
      log.info({ eventType, actorUserId, companyId }, 'auth.hook.inserted');
    }
  } catch (e) {
    log.error({ err: String(e), eventType }, 'auth.hook.insert_exception');
  }

  // Always 200 — auth must not be blocked by our audit layer.
  return NextResponse.json({ ok: true });
}

function firstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  return forwardedFor.split(',')[0]?.trim() ?? null;
}

function scrubPayload(body: Record<string, unknown>): Record<string, unknown> {
  // Remove fields that must never appear in our audit store.
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
