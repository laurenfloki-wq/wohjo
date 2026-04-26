// Worker dispute channel — POST /api/worker/disputes/new
//
// Layer 3.1 — direct path for workers to escalate to FLOSMOSIS
// without going through their employer. Authenticated by worker
// session only. The dispute is recorded in worker_disputes; an email
// notification fires to support@flosmosis.com immediately.
//
// Founder direction (Layer 3 Jobs-standard): "FLOSTRUCTION is the
// substrate workers like Joao will rely on when they have nothing
// else." This route operates regardless of company subscription
// state — even after the company cancels.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
// L2.1 — MFA gate on dispute creation. Disputes are a high-value
// worker action; the worker must hold an active MFA grant for
// DISPUTE_NEW before this route accepts the request.
import { assertActiveGrant } from '@/lib/auth/worker-mfa';
import { AuthorizationError } from '@/lib/auth/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DisputeInputSchema = z.object({
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

function safeForEmail(value: string | null | undefined, max = 500): string {
  if (!value) return '(none)';
  return String(value).replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export async function POST(req: Request): Promise<Response> {
  const log = routeLogger('POST /api/worker/disputes/new', req.headers.get('x-request-id'));
  log.info({}, 'request.received');

  // Rate limit — workers shouldn't be filing >5 disputes/hour from one IP.
  const ip = getClientIP(req);
  const rl = checkRateLimit(`worker-dispute:${ip}`, { windowMs: 60 * 60 * 1000, maxRequests: 5 });
  if (!rl.allowed) {
    log.warn({ ip }, 'worker.dispute.rate_limit');
    return NextResponse.json(
      { error: 'Too many disputes. Please try again in an hour, or contact support@flosmosis.com directly.' },
      { status: 429 },
    );
  }

  // Worker session check — uses Supabase cookie-bound client.
  const userClient = await createClient();
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  // Parse + validate body.
  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = DisputeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Resolve the worker record from the auth session.
  const { data: worker, error: workerErr } = await supabase
    .from('workers')
    .select('id, company_id, first_name, last_name, phone, employment_end_date')
    .eq('user_id', userRes.user.id)
    .maybeSingle();
  if (workerErr || !worker) {
    log.warn({ userId: userRes.user.id }, 'worker.dispute.no_worker_for_user');
    return NextResponse.json(
      { error: 'No worker record matches your session', code: 'WORKER_NOT_FOUND' },
      { status: 404 },
    );
  }

  // L2.1 MFA gate. Worker must hold an active DISPUTE_NEW grant
  // (minted by /api/worker/mfa/verify within the last 15 min).
  try {
    await assertActiveGrant(log, worker.id, 'DISPUTE_NEW');
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          next_step: {
            method: 'POST',
            path: '/api/worker/mfa/issue',
            body: { challenge_for: 'DISPUTE_NEW' },
            hint: 'Request a 6-digit code via email, then verify at /api/worker/mfa/verify, then retry.',
          },
        },
        { status: err.status },
      );
    }
    throw err;
  }

  // Insert the dispute. We DO accept disputes from workers whose
  // employment has ended (employment_end_date set) — the entire point
  // of L3.1 is post-employment access for workers who left a company
  // that may have cancelled.
  const { data: inserted, error: insertErr } = await supabase
    .from('worker_disputes')
    .insert({
      worker_id: worker.id,
      company_id: worker.company_id,
      dispute_type: parsed.data.dispute_type,
      narrative: parsed.data.narrative,
      related_shift_id: parsed.data.related_shift_id ?? null,
      status: 'open',
    })
    .select('id, created_at')
    .single();
  if (insertErr || !inserted) {
    log.error({ err: insertErr }, 'worker.dispute.insert_failed');
    return NextResponse.json({ error: 'Failed to record dispute' }, { status: 500 });
  }

  // Email notification to FLOSMOSIS support inbox. Best-effort —
  // failure to notify does NOT roll back the dispute (the dispute
  // exists in DB and will be picked up on /command support sweep).
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const supportEmail = process.env.SUPPORT_EMAIL_TO ?? 'support@flosmosis.com';
      const fromAddr = process.env.CONTACT_EMAIL_FROM ?? 'FLOSTRUCTION <noreply@flosmosis.com>';
      await resend.emails.send({
        from: fromAddr,
        to: supportEmail,
        subject: `[Worker Dispute] ${parsed.data.dispute_type} — ${safeForEmail(worker.first_name)} ${safeForEmail(worker.last_name)}`,
        text: [
          `New worker dispute filed.`,
          ``,
          `Worker: ${safeForEmail(worker.first_name)} ${safeForEmail(worker.last_name)}`,
          `Worker phone: ${safeForEmail(worker.phone)}`,
          `Company ID at filing: ${worker.company_id}`,
          `Worker employment end date: ${worker.employment_end_date ?? '(active)'}`,
          ``,
          `Dispute type: ${parsed.data.dispute_type}`,
          `Related shift: ${parsed.data.related_shift_id ?? '(none)'}`,
          ``,
          `Narrative:`,
          safeForEmail(parsed.data.narrative, 4000),
          ``,
          `Dispute id: ${inserted.id}`,
          `Filed at: ${inserted.created_at}`,
          ``,
          `Triage at /command/support (or directly via worker_disputes table).`,
        ].join('\n'),
      });
    } else {
      log.warn({}, 'worker.dispute.no_resend_key');
    }
  } catch (e) {
    log.error({ err: String(e) }, 'worker.dispute.email_notify_failed');
    // do not roll back; dispute is durable in DB
  }

  return NextResponse.json({
    ok: true,
    dispute_id: inserted.id,
    message: "Your dispute has been recorded. FLOSMOSIS will respond within 1 business day.",
  }, { status: 201 });
}
