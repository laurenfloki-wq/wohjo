// Fleet webhook receiver. Verifies the provider signature, then enqueues onto a
// durable pgmq topic and returns fast. The worker drains idempotently. No bot
// logic runs inline here — verify + enqueue only.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { enqueue } from '@platform/queue';
import { connectors } from '@platform/index';
import { QUEUE as BOOKKEEPING_QUEUE } from '@bots/34-bookkeeping/handler';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const log = routeLogger('POST /api/fleet/webhook/:provider', request.headers.get('x-request-id'));
  const body = await request.text();

  if (provider === 'stripe') {
    const sig = request.headers.get('stripe-signature') ?? '';
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const ok = secret && (await connectors.stripe.verifyWebhookSignature(body, sig, secret));
    if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 400 });

    const event = JSON.parse(body) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    if (event.type !== 'charge.succeeded' && event.type !== 'payment_intent.succeeded') {
      return NextResponse.json({ status: 'ignored' });
    }
    const charge = event.data.object as Record<string, unknown>;
    const msgId = await enqueue(BOOKKEEPING_QUEUE, {
      eventId: event.id,
      chargeId: charge.id,
      amountCents: charge.amount,
      feeCents: charge.application_fee_amount ?? 0,
      currency: charge.currency,
      contactName: (charge.billing_details as { name?: string } | undefined)?.name ?? 'Unknown',
      description: charge.description ?? 'Stripe charge',
    });
    log.info({ provider, msgId }, 'fleet.webhook.enqueued');
    return NextResponse.json({ status: 'queued', msgId });
  }

  // Other providers (hubspot, gmail) verify with their own scheme once secrets
  // are present; until then we reject rather than enqueue unverified payloads.
  log.warn({ provider }, 'fleet.webhook.unconfigured');
  return NextResponse.json(
    { error: `webhook provider not configured: ${provider}` },
    { status: 501 },
  );
}
