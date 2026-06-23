// Stripe webhook receiver (Deno Edge Function).
//
// Verifies the Stripe signature, then enqueues onto the bookkeeping pgmq topic
// and returns 200 fast. The durable worker (drained every minute by pg_cron)
// does the idempotent Xero posting (bot 34). The receiver never does money work
// inline — it only verifies and enqueues.
//
// Excluded from root tsc (Deno URL imports).

// @ts-nocheck — Deno runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string) {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k, v];
    }),
  );
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return expected === v1;
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature') ?? '';
  const body = await req.text();
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  if (!(await verifyStripeSignature(body, sig, secret))) {
    return new Response('invalid signature', { status: 400 });
  }

  const event = JSON.parse(body);
  // Only enqueue charge-succeeded style events; ignore the rest.
  if (event.type !== 'charge.succeeded' && event.type !== 'payment_intent.succeeded') {
    return new Response('ignored', { status: 200 });
  }

  const charge = event.data.object;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const msg = {
    eventId: event.id,
    chargeId: charge.id,
    amountCents: charge.amount,
    feeCents: charge.application_fee_amount ?? 0,
    currency: charge.currency,
    contactName: charge.billing_details?.name ?? 'Unknown',
    description: charge.description ?? 'Stripe charge',
  };
  // pgmq.send via RPC. The queue is created at deploy time.
  const { error } = await supabase.rpc('pgmq_send', { queue_name: 'bookkeeping', msg });
  if (error) return new Response('enqueue failed', { status: 500 });

  return new Response('queued', { status: 200 });
});
