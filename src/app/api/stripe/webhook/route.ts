// Stripe webhook endpoint.
// Mounted at: /api/stripe/webhook
//
// Defensive sequence (all-or-reject; do NOT process if any step fails):
//   1. Read raw body (must be the bytes Stripe signed; do NOT use req.json()).
//   2. Verify Stripe-Signature header (HMAC-SHA256 + 5 min tolerance).
//   3. Parse JSON event.
//   4. Idempotency claim: INSERT into stripe_event_log; PRIMARY KEY
//      conflict = the row already exists. B2 (2026-06-12): existence
//      alone is NOT proof of processing — a handler failure leaves the
//      row with processed_at NULL, and treating that as "already
//      processed" silently drops the event on Stripe's retry. On
//      conflict, check processed_at:
//        - processed_at set            → true replay → 200 no-op.
//        - NULL, received < 120s ago   → first attempt likely still in
//          flight → 503 so Stripe retries later (prevents concurrent
//          double-dispatch of the same event).
//        - NULL, received ≥ 120s ago   → first attempt failed → this IS
//          the retry; re-dispatch the handler.
//   5. Dispatch to the registered handler for the event type. Unknown
//      types are 200-no-op'd.
//   6. On handler success: UPDATE stripe_event_log SET processed_at.
//   7. On handler error: do NOT mark processed_at; Stripe will retry,
//      and the retry re-dispatches via the stale-unprocessed path in
//      step 4.
//
// The route returns 200 on idempotency hit AND on handler success;
// returns 4xx on signature/parsing failure; returns 5xx on handler
// error so Stripe retries.

import { NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe/webhook-signature';
import { lookupHandler, type StripeEvent } from '@/lib/stripe/webhook-handlers';
import { routeLogger } from '@/lib/logger';
// W5 (2026-06-11) — chokepoint follow-up named in PR #90: this route
// previously built its own supabase-js client, a confinement bypass
// invisible to the lint guard (different import). System surface:
// signature-gated webhook.
import { getServiceClientForSystemJob } from '@/lib/db/service-client';

// Mark this route as Node runtime (not Edge) so we can use crypto + Supabase service-role.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// B2 (2026-06-12): how long after receipt an unprocessed event-log row
// is presumed to belong to a still-running first attempt. Stripe's
// automatic retries arrive minutes-to-hours later, far outside this
// window; concurrent duplicate deliveries arrive within seconds, far
// inside it.
const IN_FLIGHT_GRACE_MS = 120_000;

function getServiceSupabase() {
  // The HandlerContext type predates the chokepoint; structurally the
  // clients are identical (both supabase-js), so the cast is nominal.
  return getServiceClientForSystemJob() as unknown as import('@supabase/supabase-js').SupabaseClient;
}

type RouteLog = ReturnType<typeof routeLogger>;

// Step 5/6 — dispatch + mark processed. Shared by the first-delivery
// path and the B2 stale-retry re-dispatch path.
async function dispatchEvent(
  event: StripeEvent,
  supabase: import('@supabase/supabase-js').SupabaseClient,
  log: RouteLog,
  redispatch: boolean,
): Promise<Response> {
  const handler = lookupHandler(event.type);
  if (!handler) {
    log.info({ eventType: event.type }, 'stripe.webhook.unhandled_type');
    // Mark processed so we don't see it again. B2: summary fields only —
    // never store the full event payload here (privacy).
    await supabase.from('stripe_event_log')
      .update({
        processed_at: new Date().toISOString(),
        payload_summary: { livemode: event.livemode, created: event.created, _note: 'unhandled' },
      })
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

  log.info({ eventType: event.type, summary: result.summary, redispatch }, 'stripe.webhook.handled');
  return NextResponse.json({ received: true, handled: true, redispatched: redispatch }, { status: 200 });
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

  // Step 4 — idempotency claim. Insert; PK conflict = row exists.
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
      // B2 (2026-06-12): the row's existence only proves receipt — read
      // processed_at to distinguish replay / in-flight / failed-first-attempt.
      const { data: existing, error: readErr } = await supabase
        .from('stripe_event_log')
        .select('processed_at, received_at')
        .eq('event_id', event.id)
        .maybeSingle();
      if (readErr || !existing) {
        log.error({ err: readErr, eventId: event.id }, 'stripe.webhook.event_log_read_failed');
        return NextResponse.json({ error: 'Failed to read event log' }, { status: 500 });
      }

      if (existing.processed_at) {
        log.info({ eventId: event.id }, 'stripe.webhook.idempotent_replay');
        return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
      }

      const receivedAtMs = existing.received_at
        ? new Date(existing.received_at as string).getTime()
        : 0; // missing/unparseable received_at → treat as stale → re-dispatch
      const ageMs = Date.now() - receivedAtMs;
      if (Number.isFinite(receivedAtMs) && receivedAtMs > 0 && ageMs < IN_FLIGHT_GRACE_MS) {
        log.warn({ eventId: event.id, ageMs }, 'stripe.webhook.duplicate_in_flight');
        return NextResponse.json(
          { error: 'Event processing in flight; retry later' },
          { status: 503 },
        );
      }

      log.warn({ eventId: event.id, ageMs }, 'stripe.webhook.retry_redispatch');
      return dispatchEvent(event, supabase, log, true);
    }
    log.error({ err: insertErr }, 'stripe.webhook.event_log_insert_failed');
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 });
  }

  // Step 5/6 — first delivery dispatch.
  return dispatchEvent(event, supabase, log, false);
}
