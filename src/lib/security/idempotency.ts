// Idempotency keys for webhook endpoints.
//
// Problem: external services retry webhook delivery on timeout or network
// flake. We want every retried webhook to produce the same observable
// effect (no double-insert, no duplicate SMS, no duplicate email).
//
// Approach: record every delivered-webhook's idempotency key in a
// postgres table with a UNIQUE constraint on (source, key). First delivery
// inserts a row; replays collide on the unique index and return
// `{ duplicate: true, firstSeenAt }` so the caller can short-circuit.
//
// Key conventions per source:
//   * Twilio           — formParams.MessageSid (unique per inbound message, survives retries)
//   * Stripe           — event.id (evt_...) from the Stripe-Signature header
//   * Supabase Auth    — payload.id (uuid)
//   * Generic          — request header `Idempotency-Key`
//
// This module is server-only. It uses the service-role Supabase client
// because the idempotency table has RLS enabled and only service_role
// can write.
//
// Table DDL (idempotency table):
//   see migrations/A2-webhook-idempotency.sql
//
// Usage:
//   import { checkAndRecordWebhookIdempotency } from '@/lib/security/idempotency';
//   const { duplicate, firstSeenAt } = await checkAndRecordWebhookIdempotency('twilio', messageSid, '/api/webhooks/twilio/sms-reply');
//   if (duplicate) {
//     log.info({ key: messageSid, firstSeenAt }, 'webhook.replay.ignored');
//     return twimlResponse(''); // or whatever "I already processed you" response fits the protocol
//   }

import { createServiceClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export type WebhookSource = 'twilio' | 'stripe' | 'supabase-auth' | 'generic';

export interface IdempotencyResult {
  duplicate: boolean;
  firstSeenAt?: string;
}

/**
 * Check whether (source, key) has been seen before. If not, record it.
 *
 * Returns `duplicate: true` if it was already recorded (the current
 * request is a retry). Returns `duplicate: false` if this is the first
 * time (and the row has been inserted).
 *
 * On DB error, opens the gate (returns duplicate: false) and logs the
 * error so the external service's retry still produces an effect. This
 * is the safe direction: we'd rather double-process than drop a webhook
 * that we've never processed. If the caller's operations are themselves
 * idempotent at the business-logic level (e.g. inserts keyed by
 * shift_id), this belt-and-braces double-coverage is fine.
 */
export async function checkAndRecordWebhookIdempotency(
  source: WebhookSource,
  key: string,
  route: string,
): Promise<IdempotencyResult> {
  if (!key || key.length === 0) {
    // No key means we cannot dedupe. Open the gate but log a warning —
    // caller ought to have passed a real key.
    logger.warn({ source, route }, 'idempotency.no_key');
    return { duplicate: false };
  }
  const supabase = createServiceClient();
  // INSERT returning. If unique constraint fires, fetch the first-seen row.
  const { error: insertError } = await supabase
    .from('webhook_idempotency')
    .insert({
      source,
      key,
      route,
      first_seen_at: new Date().toISOString(),
    });
  if (!insertError) {
    return { duplicate: false };
  }
  // Postgres unique-violation SQLSTATE is 23505; Supabase surfaces via the code.
  if (insertError.code === '23505') {
    // Fetch the first_seen_at of the existing row for the log.
    const { data: existing } = await supabase
      .from('webhook_idempotency')
      .select('first_seen_at')
      .eq('source', source)
      .eq('key', key)
      .single();
    return {
      duplicate: true,
      firstSeenAt: existing?.first_seen_at,
    };
  }
  // Any other error: log and open the gate.
  logger.error({ err: insertError, source, key, route }, 'idempotency.record.failed');
  return { duplicate: false };
}
