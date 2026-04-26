// Stripe webhook endpoint.
// Mounted at: /api/stripe/webhook
//
// Defensive sequence (all-or-reject; do NOT process if any step fails):
//   1. Read raw body (must be the bytes Stripe signed; do NOT use req.json()).
//   2. Verify Stripe-Signature header (HMAC-SHA256 + 5 min tolerance).
//   3. Parse JSON event.
//   4. Idempotency check: INSERT into stripe_event_log; PRIMARY KEY
//      conflict = already processed → return 200 immediately.
//   5. Dispatch to the registered handler for the event type. Unknown
//      types are 200-no-op'd.
//   6. On handler success: UPDATE stripe_event_log SET processed_at.
//   7. On handler error: do NOT mark processed_at; Stripe will retry.
//
// The route returns 200 on idempotency hit AND on handler success;
// returns 4xx on signature/parsing failure; returns 5xx on handler
// error so Stripe retries.

import { NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe/webhook-signature';
import { lookupHandler, type StripeEvent } from '@/lib/stripe/webhook-handlers';
import { routeLogger } from '@/lib/logger';
import { createClient } from '@supabase/supabase-js';

// Mark this route as Node runtime (not Edge) so we can use crypto + Supabase service-role.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the Stripe webhook route');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request): Promise<Response> {
  const log = routeLogger('POST /api/stripe/webhook', req.headers.get('x-request-id'));
  const sig = req.headers.get('stripe-signature') ?? '';
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Operator misconfiguration. Fail loud — Stripe will retry; founder
    // sees the error in the Stripe dashboard.
    log.error({}, 'stripe.webhook.secret_missing');
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 500 });
  }

  // Step 1 — read raw body (signature is over byte-exact request body).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (e) {
    log.warn({ err: String(e) }, 'stripe.webhook.body_read_failed');
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 });
  }

  // Step 2 — signature verification.
  const verify = verifyStripeSignature({ payload: rawBody, header: sig, secret });
  if (!verify.ok) {
    log.warn({ reason: verify.reason }, 'stripe.webhook.signature_rejected');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Step 3 — parse event.
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    log.warn({}, 'stripe.webhook.bad_json');
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  // Step 4 — idempotency. Insert; PK conflict = already processed.
  const supabase = getServiceSupabase();
  const { error: insertErr } = await supabase
    .from('stripe_event_log')
    .insert({
      event_id: event.id,
      event_type: event.type,
      received_at: new Date().toISOString(),
      payload_summary: { livemode: event.livemode, created: event.created },
    });
  if (insertErr) {
    // PostgreSQL unique-violation code is 23505. Supabase wraps it; check
    // both the message and the optional `code` field.
    const isDuplicate = insertErr.code === '23505' ||
                        /duplicate key/i.test(insertErr.message ?? '');
    if (isDuplicate) {
      log.info({ eventId: event.id }, 'stripe.webhook.idempotent_replay');
      return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
    }
    log.error({ err: insertErr }, 'stripe.webhook.event_log_insert_failed');
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  // Step 5 — dispatch.
  const handler = lookupHandler(event.type);
  if (!handler) {
    log.info({ eventType: event.type }, 'stripe.webhook.unhandled_type');
    // Mark processed so we don't see it again.
    await supabase.from('stripe_event_log')
      .update({ processed_at: new Date().toISOString(), payload_summary: { ...event, _note: 'unhandled' } })
      .eq('event_id', event.id);
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  let result;
  try {
    result = await handler(event, { log, supabase });
  } catch (e) {
    log.error({ err: String(e), eventType: event.type }, 'stripe.webhook.handler_threw');
    // Do NOT mark processed_at; Stripe will retry.
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  if (!result.ok) {
    log.error({ eventType: event.type, summary: result.summary, err: result.error },
      'stripe.webhook.handler_failed');
    return NextResponse.json({ error: result.error ?? 'Handler failed' }, { status: 500 });
  }

  // Step 6 — mark processed.
  await supabase.from('stripe_event_log')
    .update({
      processed_at: new Date().toISOString(),
      payload_summary: { livemode: event.livemode, created: event.created, summary: result.summary },
    })
    .eq('event_id', event.id);

  log.info({ eventType: event.type, summary: result.summary }, 'stripe.webhook.handled');
  return NextResponse.json({ received: true, handled: true }, { status: 200 });
}
