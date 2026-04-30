// POST /api/wles/interest — WLES Foundation engagement capture
//
// Captures email-only expressions of interest from prospective
// WLES implementers and prospective independent verifiers. Forwards
// the submission to standards@flosmosis.com via Resend.
//
// Per WLES Foundation Constitution v1.0 (effective 27 April 2026,
// FLOSMOSIS PTY LTD as Foundation Entity, ACT-law governance per
// clause 11), engagement with the standard is open per clause 7.3.
// This endpoint is the front-door capture for non-customer
// engagement (implementers and independent verifiers do not
// onboard via the Founding Customer Program in clause 8 — they
// engage with the standard directly).
//
// Rate limit: 5 submissions per IP per hour using the in-process
// rate limiter, matching /api/contact.

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

const STANDARDS_EMAIL_TO = () => process.env.STANDARDS_EMAIL_TO ?? 'standards@flosmosis.com';
const STANDARDS_EMAIL_FROM = () =>
  process.env.STANDARDS_EMAIL_FROM ?? 'WLES Foundation <noreply@flosmosis.com>';

const InterestSchema = z.object({
  email: z.string().email('valid email required').max(200),
  interest: z.enum(['implementer', 'verifier']),
  organisation: z.string().max(200).optional().default(''),
  note: z.string().max(2000).optional().default(''),
});

export const deps = {
  makeResend(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is required');
    return new Resend(apiKey);
  },
};

export async function POST(request: Request) {
  const log = routeLogger('POST /api/wles/interest', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'wles_interest.received');

  const ip = getClientIP(request);
  const rl = checkRateLimit(`wles-interest:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    log.warn({ ip }, 'wles_interest.rate_limit.exceeded');
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please try again in an hour.' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = InterestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const interestLabel = data.interest === 'implementer' ? 'Implementer' : 'Independent verifier';
  const subject = `WLES engagement — ${interestLabel} — ${data.email}`;
  const body = [
    `Interest:         ${interestLabel}`,
    `Email:            ${data.email}`,
    data.organisation ? `Organisation:     ${data.organisation}` : null,
    '',
    data.note || '(no note)',
    '',
    '---',
    'Captured via /wles/' + (data.interest === 'implementer' ? 'implementers' : 'verifier'),
    'WLES Foundation · FLOSMOSIS PTY LTD · Constitution v1.0 cl 7.3 (open standard)',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const resend = deps.makeResend();
    await resend.emails.send({
      from: STANDARDS_EMAIL_FROM(),
      to: STANDARDS_EMAIL_TO(),
      replyTo: data.email,
      subject,
      text: body,
    });
    log.info({ interest: data.interest }, 'wles_interest.sent');
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err }, 'wles_interest.send_failed');
    return NextResponse.json(
      { error: 'Could not send. Please try again.' },
      { status: 502 },
    );
  }
}
