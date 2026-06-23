// Bookkeeping queue worker. Drained every minute (pg_cron -> invoke). Node
// runtime (uses platform/queue's postgres.js client). Idempotent per message
// via the handler's idempotency claim.

import { drain } from '../../platform/queue';
import { BOT_ID, QUEUE, handle, type StripeChargeEvent } from './handler';

export async function runWorker(): Promise<{ processed: number; failed: number }> {
  return drain<StripeChargeEvent>(QUEUE, BOT_ID, handle, { batch: 10, vtSeconds: 60 });
}
