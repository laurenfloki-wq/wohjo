// Fleet durable-queue worker. Vercel Cron hits this every minute; it drains the
// money/evidence pgmq topics idempotently (the handlers claim an idempotency key
// before any consequential work). Authorization: Bearer CRON_SECRET.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { drain } from '@platform/queue';
import {
  handle as bookkeepingHandle,
  QUEUE as BOOKKEEPING_QUEUE,
  BOT_ID as BOOKKEEPING_ID,
  type StripeChargeEvent,
} from '@bots/34-bookkeeping/handler';

export async function GET(request: Request) {
  const log = routeLogger('GET /api/fleet/worker', request.headers.get('x-request-id'));
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // Each durable topic drains here. Add new money/evidence topics to this list.
    const bookkeeping = await drain<StripeChargeEvent>(
      BOOKKEEPING_QUEUE,
      BOOKKEEPING_ID,
      bookkeepingHandle,
      { batch: 10, vtSeconds: 60 },
    );
    log.info({ bookkeeping }, 'fleet.worker.drained');
    return NextResponse.json({ ok: true, drained: { bookkeeping } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error({ err: message }, 'fleet.worker.error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
