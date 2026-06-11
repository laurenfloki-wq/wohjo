// Idempotency keys for webhook endpoints — W4/SG-5 dead-letter upgrade
// (2026-06-11; original A2 hardening Day 2).
//
// Problem: external services retry webhook delivery on timeout or network
// flake. We want every retried webhook to produce the same observable
// effect (no double-insert, no duplicate SMS, no duplicate email) — AND a
// delivery whose processing died mid-flight must never be lost.
//
// Approach (the Stripe webhook bar):
//   1. INSERT-first on (source, key) with the raw delivery payload —
//      replays collide on the unique index (SQLSTATE 23505).
//   2. processed_at is set ONLY after the caller finishes processing
//      (markWebhookProcessed). A replay of an UNPROCESSED key returns
//      { duplicate: true, processed: false } so the caller REPROCESSES —
//      the prior attempt died after recording but before completing.
//   3. An unprocessed row that outlives the provider's retry window is a
//      dead letter: it still holds the full payload (replayable) and the
//      FLOS-SHA-001 webhook_delivery_twilio check surfaces it RED.
//
// Key conventions per source:
//   * Twilio           — formParams.MessageSid (unique per inbound message, survives retries)
//   * Stripe           — event.id (evt_...) (the Stripe route keeps its own stripe_event_log)
//   * Supabase Auth    — payload.id (uuid)
//   * Generic          — request header `Idempotency-Key`
//
// This module is server-only; the table is RLS service-role-only. The
// client comes from the service-client chokepoint (SG-2 discipline).
//
// Table DDL: migrations/A2-webhook-idempotency.sql +
// migrations/20260611013500_w4_webhook_idempotency_dead_letter.sql

import { getServiceClient } from '@/lib/db/service-client';
import { logger } from '@/lib/logger';

export type WebhookSource = 'twilio' | 'stripe' | 'supabase-auth' | 'generic';

export interface IdempotencyResult {
  duplicate: boolean;
  firstSeenAt?: string;
  /** Only meaningful when duplicate=true: was the prior delivery fully
   *  processed? false = the prior attempt died mid-flight — REPROCESS. */
  processed?: boolean;
}

/**
 * Check whether (source, key) has been seen before. If not, record it
 * together with the raw delivery payload.
 *
 * Returns `duplicate: true, processed: true` when the prior delivery
 * completed — short-circuit. Returns `duplicate: true, processed: false`
 * when the prior delivery was recorded but never finished — the caller
 * must REPROCESS (W4/SG-5). Returns `duplicate: false` on first sight.
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
  payload?: Record<string, unknown>,
): Promise<IdempotencyResult> {
  if (!key || key.length === 0) {
    // No key means we cannot dedupe. Open the gate but log a warning —
    // caller ought to have passed a real key.
    logger.warn({ source, route }, 'idempotency.no_key');
    return { duplicate: false };
  }
  const supabase = getServiceClient();
  // INSERT returning. If unique constraint fires, fetch the first-seen row.
  const { error: insertError } = await supabase
    .from('webhook_idempotency')
    .insert({
      source,
      key,
      route,
      first_seen_at: new Date().toISOString(),
      payload: payload ?? null,
    });
  if (!insertError) {
    // CRACK 158 — opportunistic lazy cleanup. Every ~100th call, sweep
    // PROCESSED entries older than 7 days. Unprocessed rows are dead
    // letters and are NEVER swept — they hold the only durable copy of
    // an unfinished field action (W4/SG-5).
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      void supabase
        .from('webhook_idempotency')
        .delete()
        .lt('first_seen_at', cutoff)
        .not('processed_at', 'is', null)
        .then(({ error: cleanupError }: { error: { message: string } | null }) => {
          if (cleanupError) {
            logger.warn({ err: cleanupError.message }, 'idempotency.cleanup.failed');
          }
        });
    }
    return { duplicate: false };
  }
  // Postgres unique-violation SQLSTATE is 23505; Supabase surfaces via the code.
  if (insertError.code === '23505') {
    // Fetch the first-seen row — processed_at decides replay semantics.
    const { data: existing } = await supabase
      .from('webhook_idempotency')
      .select('first_seen_at, processed_at')
      .eq('source', source)
      .eq('key', key)
      .single();
    return {
      duplicate: true,
      firstSeenAt: existing?.first_seen_at,
      processed: Boolean(existing?.processed_at),
    };
  }
  // Any other error: log and open the gate.
  logger.error({ err: insertError, source, key, route }, 'idempotency.record.failed');
  return { duplicate: false };
}

/**
 * Mark a delivery as fully processed (W4/SG-5 — the Stripe bar's
 * step 6). Call ONLY after the caller's processing completed; a missed
 * call leaves the row unprocessed, which is exactly what makes the
 * replay/dead-letter machinery work. Errors are logged, never thrown —
 * a marking failure must not turn a processed delivery into a 5xx
 * (the worst case is one redundant reprocess on the next replay).
 */
export async function markWebhookProcessed(
  source: WebhookSource,
  key: string,
  outcome: string,
): Promise<void> {
  if (!key || key.length === 0) return;
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('webhook_idempotency')
    .update({ processed_at: new Date().toISOString(), outcome })
    .eq('source', source)
    .eq('key', key);
  if (error) {
    logger.error({ err: error, source, key }, 'idempotency.mark_processed.failed');
  }
}
