# Webhook idempotency — usage guide

Apply `checkAndRecordWebhookIdempotency` **after** signature validation
but **before** any business-logic side effects. Always log the replay
as `webhook.replay.ignored` and return a success-looking response so
the external service stops retrying.

## Twilio (live — `/api/webhooks/twilio/sms-reply`)

```ts
const messageSid = formParams.MessageSid ?? '';
if (messageSid) {
  const { duplicate, firstSeenAt } = await checkAndRecordWebhookIdempotency(
    'twilio',
    messageSid,
    '/api/webhooks/twilio/sms-reply',
  );
  if (duplicate) {
    log.info({ messageSid, firstSeenAt }, 'webhook.replay.ignored');
    return twimlResponse('');   // empty TwiML = 200 OK, no reply
  }
}
```

## Stripe (future — `/api/webhooks/stripe`)

```ts
// Stripe gives every event a unique `evt_...` id. Use it as the key.
// Body is a raw buffer; signature lives in `Stripe-Signature` header.

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const sig = request.headers.get('stripe-signature') ?? '';
const body = await request.text();

let event: Stripe.Event;
try {
  event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
} catch {
  return new Response('Invalid signature', { status: 400 });
}

const { duplicate } = await checkAndRecordWebhookIdempotency(
  'stripe',
  event.id,                              // e.g. 'evt_1Nkx...'
  '/api/webhooks/stripe',
);
if (duplicate) {
  log.info({ eventId: event.id }, 'webhook.replay.ignored');
  return new Response('', { status: 200 });
}

// ...handle event.type...
```

## Supabase Auth (future — `/api/webhooks/supabase-auth`)

```ts
// Supabase Auth webhooks are signed with an HMAC in the `webhook-signature`
// header; payload has a UUID `id` we use as the key.

import { createHmac, timingSafeEqual } from 'crypto';
const sig = request.headers.get('webhook-signature') ?? '';
const body = await request.text();
const expected = createHmac('sha256', process.env.SUPABASE_WEBHOOK_SECRET!)
  .update(body)
  .digest('hex');
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return new Response('Invalid signature', { status: 403 });
}

const payload = JSON.parse(body) as { id: string; type: string; record: unknown };
const { duplicate } = await checkAndRecordWebhookIdempotency(
  'supabase-auth',
  payload.id,
  '/api/webhooks/supabase-auth',
);
if (duplicate) {
  log.info({ eventId: payload.id, type: payload.type }, 'webhook.replay.ignored');
  return new Response('', { status: 200 });
}

// ...handle payload.type...
```

## Generic (future — any new webhook using the `Idempotency-Key` convention)

```ts
const key = request.headers.get('idempotency-key') ?? '';
if (!key) return new Response('Idempotency-Key header required', { status: 400 });

const { duplicate } = await checkAndRecordWebhookIdempotency(
  'generic',
  key,
  '/api/webhooks/generic',
);
if (duplicate) {
  return new Response('', { status: 200 });
}
```

## Table and cleanup

- Table is `webhook_idempotency` with UNIQUE(source, key). RLS
  enabled; only service_role can read/write.
- Rows are currently retained indefinitely. Day 2+ housekeeping: add
  a nightly `DELETE FROM webhook_idempotency WHERE first_seen_at <
  now() - interval '30 days'` once we have enough volume to need it.
- If the DB is unreachable the helper OPENS the gate (`duplicate=false`)
  rather than failing closed. Double-processing is a lesser harm than
  dropping a first-time delivery. Business-logic layers should still
  dedupe on natural keys (shift_id, worker_id, message_sid) where
  possible.
