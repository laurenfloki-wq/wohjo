// Flostruction — Founding Customer API
// POST /api/founding — submit a founding customer lead
//
// Day-7 P0-4 security patch (2026-04-23):
//   Previously had no rate limiting on a public endpoint that
//   decrements a shared counter — any attacker could exhaust the 20
//   founding spots with noise. Email body interpolated body fields
//   without sanitisation.
//   Now: rate-limited per IP (3 per hour), zod-validated payload
//   (phone regex, length caps), and email body sanitisation strips
//   CR/LF from interpolated fields.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { z } from 'zod';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is required');
  return new Resend(apiKey);
}

const FoundingLeadSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, 'phone too short')
    .max(30, 'phone too long')
    .regex(/^[+0-9()\s-]{8,30}$/, 'phone format invalid'),
  company_name: z.string().trim().max(120).optional(),
  contact_name: z.string().trim().max(120).optional(),
  worker_count: z.number().int().min(1).max(10000).optional(),
});

// Strip CR/LF from user-supplied fields before embedding in email body
// to prevent body injection. Also cap any single field at 200 chars for
// email readability.
function safeForEmail(value: string | null | undefined): string {
  if (!value) return 'N/A';
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 200);
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/founding', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Rate limit — 3 submissions per hour per IP. The endpoint
  // decrements a shared counter, so it's a prime abuse target.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`founding:${ip}`, { windowMs: 60 * 60 * 1000, maxRequests: 3 });
  if (!rl.allowed) {
    log.warn({ ip }, 'founding.rate_limit.exceeded');
    return NextResponse.json(
      { error: 'Too many submissions. Please try again in an hour.' },
      { status: 429 },
    );
  }

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const parsed = FoundingLeadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Atomic spot allocation per Saturday Shape A Task A2.
    // Pre-fix this was a read-then-write pattern with a race condition
    // (two concurrent submissions could both read spots_remaining=5
    // and both insert spot_number=16). The new
    // allocate_founding_spot() Postgres function uses FOR UPDATE row
    // lock for atomic decrement. Returns the allocated spot_number
    // (1..20) on success or -1 if the cohort is at capacity.
    //
    // Migration migrations/202605020920_atomic_founding_spot.sql.
    const { data: spotResult, error: spotErr } = await supabase.rpc(
      'allocate_founding_spot',
    );

    if (spotErr) {
      log.error({ err: spotErr.message }, 'founding.spot_alloc_failed');
      return NextResponse.json(
        { error: 'Could not allocate spot. Please try again in a moment.' },
        { status: 500 },
      );
    }

    const allocatedSpot = typeof spotResult === 'number' ? spotResult : -1;

    // Cap-reached behaviour per Lauren's Friday founder decision:
    // redirect to waitlist surface (status='WAITLIST' on
    // founding_leads), do NOT auto-convert to standard tier and do
    // NOT reject. The waitlist row preserves the lead so Lauren can
    // reach out manually if a spot opens up.
    if (allocatedSpot === -1) {
      const { error: waitlistErr } = await supabase
        .from('founding_leads')
        .insert({
          phone: body.phone,
          company_name: body.company_name ?? null,
          contact_name: body.contact_name ?? null,
          worker_count: body.worker_count ?? null,
          spot_number: null,
          status: 'WAITLIST',
        });
      if (waitlistErr) {
        log.error(
          { err: waitlistErr.message },
          'founding.waitlist_insert_failed',
        );
        // Surface the lead via Resend even if the waitlist insert
        // failed — Lauren still wants to know who tried.
        try {
          const resend = getResend();
          await resend.emails.send({
            from: 'FLOSTRUCTION <noreply@flosmosis.com>',
            to: 'lauren@flosmosis.com.au',
            subject: `[FOUNDING WAITLIST] ${safeForEmail(body.phone)}`,
            text: [
              'Founding waitlist lead (Supabase insert failed):',
              `Phone: ${safeForEmail(body.phone)}`,
              `Company: ${safeForEmail(body.company_name)}`,
              `Name: ${safeForEmail(body.contact_name)}`,
              `Workers: ${body.worker_count ?? 'N/A'}`,
              `Error: ${safeForEmail(waitlistErr.message)}`,
            ].join('\n'),
          });
        } catch (emailErr) {
          log.error({ err: emailErr }, 'founding.waitlist_email_fallback_failed');
        }
        return NextResponse.json(
          {
            error: 'Could not add to waitlist. We have your details and will call you.',
          },
          { status: 500 },
        );
      }

      // Notify Lauren of the waitlist entry.
      try {
        const resend = getResend();
        await resend.emails.send({
          from: 'FLOSTRUCTION <noreply@flosmosis.com>',
          to: 'lauren@flosmosis.com.au',
          subject: `[FOUNDING WAITLIST] ${safeForEmail(body.phone)}`,
          text: [
            'New founding waitlist lead (cohort full):',
            `Phone: ${safeForEmail(body.phone)}`,
            `Company: ${safeForEmail(body.company_name)}`,
            `Name: ${safeForEmail(body.contact_name)}`,
            `Workers: ${body.worker_count ?? 'N/A'}`,
          ].join('\n'),
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, 'founding.waitlist_notify_failed');
      }

      return NextResponse.json({
        waitlist: true,
        message:
          'Founding cohort is full. We’ve added you to the waitlist and will be in touch if a spot opens.',
      });
    }

    const spotNumber = allocatedSpot;

    // Insert the lead. Stored values retain CR/LF; only the email
    // display path sanitises.
    const { error: insertError } = await supabase
      .from('founding_leads')
      .insert({
        phone: body.phone,
        company_name: body.company_name ?? null,
        contact_name: body.contact_name ?? null,
        worker_count: body.worker_count ?? null,
        spot_number: spotNumber,
        status: 'NEW',
      });

    if (insertError) {
      log.error({ err: insertError.message }, 'founding.supabase_insert_failed');
      // Fallback: send email
      try {
        const resend = getResend();
        await resend.emails.send({
          from: 'FLOSTRUCTION <noreply@flosmosis.com>',
          to: 'lauren@flosmosis.com.au',
          subject: `[FOUNDING LEAD] ${safeForEmail(body.phone)}`,
          text: [
            'Founding lead (Supabase insert failed):',
            `Phone: ${safeForEmail(body.phone)}`,
            `Company: ${safeForEmail(body.company_name)}`,
            `Name: ${safeForEmail(body.contact_name)}`,
            `Workers: ${body.worker_count ?? 'N/A'}`,
            `Error: ${safeForEmail(insertError.message)}`,
          ].join('\n'),
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, 'founding.resend_fallback_failed');
      }
      return NextResponse.json(
        { error: 'Something went wrong. We have your details and will call you.' },
        { status: 500 }
      );
    }

    // Spots already decremented atomically by allocate_founding_spot().
    // Compute the post-decrement counter for the response payload + the
    // notification email body.
    const newSpots = 20 - spotNumber;

    // Send notification email to Lauren
    try {
      const resend = getResend();
      await resend.emails.send({
        from: 'FLOSTRUCTION <noreply@flosmosis.com>',
        to: 'lauren@flosmosis.com.au',
        subject: `[FOUNDING LEAD] ${safeForEmail(body.phone)}`,
        text: [
          `New founding customer lead #${spotNumber}:`,
          `Phone: ${safeForEmail(body.phone)}`,
          `Company: ${safeForEmail(body.company_name)}`,
          `Name: ${safeForEmail(body.contact_name)}`,
          `Workers: ${body.worker_count ?? 'N/A'}`,
          `Spots remaining: ${newSpots}`,
        ].join('\n'),
      });
    } catch (emailErr) {
      log.error({ err: emailErr }, 'founding.notification_email_failed');
    }

    return NextResponse.json({
      success: true,
      spotNumber,
      spotsRemaining: newSpots,
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'founding.internal_error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/founding', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  // Light rate limit on the counter-read endpoint too — prevents
  // scraping from becoming a free DoS vector.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`founding.get:${ip}`, { windowMs: 60_000, maxRequests: 30 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data } = await supabase
      .from('founding_config')
      .select('value')
      .eq('key', 'spots_remaining')
      .single();

    return NextResponse.json({
      spotsRemaining: data ? parseInt(data.value, 10) : 0,
    });
  } catch {
    return NextResponse.json({ spotsRemaining: 0 });
  }
}
