// CRACK 194 — POST /api/worker/mfa/challenge
//
// SMS-based MFA challenge (Twilio). Parallel to /api/worker/mfa/issue
// which delivers via email. Challenge route delivers via SMS.
//
// Body:  { action_intent: 'DISPUTE_NEW' | 'EXPORT_FULL' | 'PHONE_CHANGE' }
// Auth:  worker session (Supabase phone-OTP).
// Rate:  3 requests per worker per 10 minutes.
//
// Test whitelist: if worker phone is +61413573579, challenge row is
// inserted with scrypt hash of '123456' valid until 2027-01-01 — no
// Twilio message sent. This phone never appears in production data.
//
// Returns: { challenge_id, expires_at, delivered_to: redacted-phone }

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes, scryptSync } from 'node:crypto';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { issueChallenge, type MfaAction } from '@/lib/auth/worker-mfa';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getTwilioClient, getTwilioFromNumber } from '@/lib/twilio/client';

const BodySchema = z.object({
  action_intent: z.enum(['DISPUTE_NEW', 'EXPORT_FULL', 'PHONE_CHANGE']),
});

// Test whitelist — do NOT send Twilio; insert fixed '123456' challenge.
const TEST_WHITELIST_PHONE = '+61413573579';
const TEST_WHITELIST_CODE = '123456';
const TEST_WHITELIST_EXPIRES = '2027-01-01T00:00:00.000Z';

// Compute a scrypt hash using the same format as worker-mfa.ts.
function scryptHash(code: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(code, salt, 32, { N: 16384, r: 8, p: 1 });
  return ['scrypt', 16384, 8, 1, salt.toString('hex'), Buffer.from(derived).toString('hex')].join(
    '$',
  );
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/worker/mfa/challenge', request.headers.get('x-request-id'));
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const action: MfaAction = parsed.data.action_intent;

    // Rate-limit: 3/worker/10min.
    const rl = checkRateLimit(`mfa-challenge:${identity.workerId}`, {
      windowMs: 10 * 60 * 1000,
      maxRequests: 3,
    });
    if (!rl.allowed) {
      log.warn({ workerId: identity.workerId, action }, 'mfa.challenge.rate_limited');
      const retryAfterSeconds = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: retryAfterSeconds,
          message: 'Too many code requests. Try again later.',
        },
        { status: 429 },
      );
    }

    // Resolve the worker's phone number.
    const supabase = createServiceClient();
    const { data: workerRow, error: workerErr } = await supabase
      .from('workers')
      .select('id, phone, first_name')
      .eq('id', identity.workerId)
      .maybeSingle();
    if (workerErr) {
      log.error({ err: workerErr.message }, 'mfa.challenge.worker_lookup_failed');
      return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
    }
    const phone = (workerRow as { phone?: string | null } | null)?.phone ?? null;
    if (!phone) {
      log.info({ workerId: identity.workerId, action }, 'mfa.challenge.no_phone_on_file');
      return NextResponse.json(
        {
          error: 'NO_PHONE_ON_FILE',
          message:
            'You do not have a phone number on file. To use SMS verification, please contact support@flosmosis.com.',
        },
        { status: 412 },
      );
    }

    // Test whitelist — create challenge row with fixed code; skip Twilio.
    if (phone === TEST_WHITELIST_PHONE) {
      log.info({ workerId: identity.workerId, action }, 'mfa.challenge.whitelist');

      // Invalidate any prior unconsumed challenge for the same pair.
      await supabase
        .from('worker_mfa_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('worker_id', identity.workerId)
        .eq('challenge_for', action)
        .is('consumed_at', null);

      const codeHash = scryptHash(TEST_WHITELIST_CODE);
      const issuedAt = new Date().toISOString();
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      const userAgent = request.headers.get('user-agent');

      const { data: row, error: insertErr } = await supabase
        .from('worker_mfa_challenges')
        .insert({
          worker_id: identity.workerId,
          challenge_for: action,
          code_hash: codeHash,
          issued_at: issuedAt,
          expires_at: TEST_WHITELIST_EXPIRES,
          ip_address: ip,
          user_agent: userAgent ?? null,
        })
        .select('id, expires_at')
        .single();
      if (insertErr || !row) {
        log.error({ err: insertErr?.message }, 'mfa.challenge.whitelist_insert_failed');
        return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
      }

      return NextResponse.json(
        {
          challenge_id: row.id,
          expires_at: row.expires_at,
          delivered_to: redactPhone(phone),
        },
        { status: 201 },
      );
    }

    // Normal flow — issue challenge + send via Twilio SMS.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent');

    const challenge = await issueChallenge(log, identity.workerId, action, {
      ip,
      userAgent,
    });

    try {
      const client = getTwilioClient();
      const from = getTwilioFromNumber();
      const body = `Flostruction MFA: ${challenge.code} — valid for 5 minutes. Do not share this code.`;
      await client.messages.create({ body, from, to: phone });
    } catch (smsErr) {
      log.error(
        { err: smsErr instanceof Error ? smsErr.message : 'unknown' },
        'mfa.challenge.sms_failed',
      );
      // Best-effort invalidate so the worker can request a new code.
      await supabase
        .from('worker_mfa_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challenge.challengeId);
      return NextResponse.json(
        { error: 'SMS_DELIVERY_FAILED', message: 'Could not deliver the code via SMS. Try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        challenge_id: challenge.challengeId,
        expires_at: challenge.expiresAt,
        delivered_to: redactPhone(phone),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    log.error({ err: msg }, 'mfa.challenge.unhandled');
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}

// Show "+614••••3579" rather than full number — confirms which phone
// without leaking the middle digits back to a hijacked session.
function redactPhone(phone: string): string {
  if (phone.length < 6) return '•'.repeat(phone.length);
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-4);
  const dots = '•'.repeat(Math.max(phone.length - 8, 2));
  return `${prefix}${dots}${suffix}`;
}
