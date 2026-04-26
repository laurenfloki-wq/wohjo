// L2.1 — POST /api/worker/mfa/issue
//
// Body:  { challenge_for: 'DISPUTE_NEW' | 'EXPORT_FULL' | 'PHONE_CHANGE' }
// Auth:  worker session (Supabase phone-OTP).
// Rate:  5 issue requests per worker per hour.
//
// Behaviour:
//   1. Resolves the worker identity from the session.
//   2. Looks up the worker's email; if missing, responds 412
//      with a clear "no email on file — contact support" message.
//   3. Issues a fresh challenge via worker-mfa.issueChallenge.
//   4. Sends the 6-digit code to the worker's email via Resend.
//   5. Returns { challenge_id, expires_at }. The code is NOT in
//      the response body — it goes via email only.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { routeLogger } from '@/lib/logger';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { AuthorizationError } from '@/lib/auth/errors';
import { issueChallenge, type MfaAction } from '@/lib/auth/worker-mfa';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { sendWorkerMfaCodeEmail } from '@/lib/email/notify';

const BodySchema = z.object({
  challenge_for: z.enum(['DISPUTE_NEW', 'EXPORT_FULL', 'PHONE_CHANGE']),
});

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/worker/mfa/issue',
    request.headers.get('x-request-id'),
  );
  log.info({}, 'request.received');

  try {
    const identity = await requireWorkerIdentity(log);

    // Parse + validate the body.
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const action: MfaAction = parsed.data.challenge_for;

    // Rate-limit: 5/h/worker.
    const rl = checkRateLimit(`mfa-issue:${identity.workerId}`, {
      windowMs: 60 * 60 * 1000,
      maxRequests: 5,
    });
    if (!rl.allowed) {
      log.warn({ workerId: identity.workerId, action }, 'mfa.issue.rate_limited');
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rl.resetAt - Date.now()) / 1000),
      );
      return NextResponse.json(
        {
          error: 'RATE_LIMITED',
          retry_after_seconds: retryAfterSeconds,
          message: 'Too many code requests. Try again later.',
        },
        { status: 429 },
      );
    }

    // Look up the worker's email. Stored on workers.email (added in
    // worker_advocacy migration via worker_disputes channel design).
    // If the workers table doesn't carry email yet for this worker,
    // we cannot deliver the code — instruct the worker to contact
    // support@flosmosis.com instead.
    const supabase = createServiceClient();
    const { data: workerRow, error: workerErr } = await supabase
      .from('workers')
      .select('id, email, first_name')
      .eq('id', identity.workerId)
      .maybeSingle();
    if (workerErr) {
      log.error({ err: workerErr.message }, 'mfa.issue.worker_lookup_failed');
      return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
    }
    const email = (workerRow as { email?: string | null } | null)?.email ?? null;
    if (!email) {
      log.info({ workerId: identity.workerId, action }, 'mfa.issue.no_email_on_file');
      return NextResponse.json(
        {
          error: 'NO_EMAIL_ON_FILE',
          message:
            'You do not have an email address on file. To use this action, please email support@flosmosis.com from any address that can identify you.',
        },
        { status: 412 },
      );
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent');

    const challenge = await issueChallenge(log, identity.workerId, action, {
      ip,
      userAgent,
    });

    // Deliver the code via email. If email send fails the challenge
    // still exists in the DB — invalidate it so the worker can
    // request a new one without bumping rate-limit headroom.
    try {
      await sendWorkerMfaCodeEmail({
        to: email,
        firstName:
          (workerRow as { first_name?: string | null } | null)?.first_name ??
          undefined,
        action,
        code: challenge.code,
        expiresAt: challenge.expiresAt,
      });
    } catch (emailErr) {
      log.error(
        { err: emailErr instanceof Error ? emailErr.message : 'unknown' },
        'mfa.issue.email_failed',
      );
      // Best-effort invalidate; don't bubble cleanup failure.
      await supabase
        .from('worker_mfa_challenges')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', challenge.challengeId);
      return NextResponse.json(
        { error: 'EMAIL_DELIVERY_FAILED', message: 'Could not deliver the code. Try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        challenge_id: challenge.challengeId,
        expires_at: challenge.expiresAt,
        delivered_to: redactEmail(email),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.status },
      );
    }
    const msg = err instanceof Error ? err.message : 'unknown';
    log.error({ err: msg }, 'mfa.issue.unhandled');
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}

// Show "j••••@example.com" rather than the full address in the response —
// confirms which inbox without leaking it back to a hijacked session.
function redactEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '••••';
  const visible = local.slice(0, 1);
  return `${visible}${'•'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
