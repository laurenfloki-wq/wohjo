// Day 3 P2.1 — Formspree replacement.
// POST /api/contact — validates the marketing-landing demo-request form,
// rate-limits per-IP, and forwards the message to Lauren's inbox via
// Resend. No third-party form handler involved.
//
// Rate limit: 5 submissions per IP per hour using the in-process Map
// based rate limiter already in src/lib/security/rate-limit.ts.

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { z } from 'zod';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

const CONTACT_EMAIL_TO = () => process.env.CONTACT_EMAIL_TO ?? 'admin@flosmosis.com';
const CONTACT_EMAIL_FROM = () => process.env.CONTACT_EMAIL_FROM ?? 'FLOSTRUCTION <noreply@flosmosis.com>';

const ContactSchema = z.object({
  name: z.string().min(1, 'name required').max(120),
  company: z.string().min(1, 'company required').max(120),
  role: z.string().max(120).optional().default(''),
  email: z.string().email('valid email required').max(200),
  phone: z.string().max(30).optional().default(''),
  workers_on_site: z.string().max(30).optional().default(''),
  payroll_system: z.string().max(120).optional().default(''),
  message: z.string().max(4000).optional().default(''),
});

// Exposed so tests can override by reassigning the property.
// In-module callers use `deps.makeResend()` — when tests replace it,
// the route picks the replacement up at call time.
export const deps = {
  makeResend(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is required');
    return new Resend(apiKey);
  },
};

export async function POST(request: Request) {
  const log = routeLogger('POST /api/contact', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  const ip = getClientIP(request);
  const rl = checkRateLimit(`contact:${ip}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    log.warn({ ip }, 'contact.rate_limit.exceeded');
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

  const parsed = ContactSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const subject = `FLOSTRUCTION demo request — ${data.company}`;
  const body = [
    `Name:             ${data.name}`,
    `Company:          ${data.company}`,
    data.role ? `Role:             ${data.role}` : null,
    `Email:            ${data.email}`,
    data.phone ? `Phone:            ${data.phone}` : null,
    data.workers_on_site ? `Workers on site:  ${data.workers_on_site}` : null,
    data.payroll_system ? `Payroll system:   ${data.payroll_system}` : null,
    '',
    data.message || '(no message)',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const resend = deps.makeResend();
    await resend.emails.send({
      from: CONTACT_EMAIL_FROM(),
      to: CONTACT_EMAIL_TO(),
      replyTo: data.email,
      subject,
      text: body,
    });
    log.info({ company: data.company }, 'contact.sent');
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err }, 'contact.send_failed');
    return NextResponse.json(
      { error: 'Could not send message. Please try again.' },
      { status: 502 },
    );
  }
}
