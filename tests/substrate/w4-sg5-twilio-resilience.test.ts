// W4 / SG-5 — Twilio resilience pins (2026-06-11).
//
// The Stripe-bar contract on Twilio inbound: insert-first idempotency
// WITH processed-tracking, reprocess-on-unfinished-replay, 5xx-for-
// retry, dead letters preserved and surfaced. An outage cannot lose a
// field action.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
const LIB = read('src/lib/security/idempotency.ts');
const SMS = read('src/app/api/webhooks/twilio/sms-reply/route.ts');
const HEALTH = read('src/app/api/cron/substrate-health/route.ts');
const MIGRATION = read('migrations/20260611013500_w4_webhook_idempotency_dead_letter.sql');

describe('W4.1 — delivery log carries the Stripe-bar semantics', () => {
  it('migration adds payload, processed_at, outcome + the dead-letter index', () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS payload jsonb/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS processed_at timestamptz/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS outcome text/);
    expect(MIGRATION).toMatch(/idx_webhook_idempotency_unprocessed/);
    expect(MIGRATION).toMatch(/WHERE processed_at IS NULL/);
  });

  it('helper records the payload and reports processed on replays', () => {
    expect(LIB).toMatch(/payload\?:\s*Record<string, unknown>/);
    expect(LIB).toMatch(/payload:\s*payload \?\? null/);
    expect(LIB).toMatch(/processed:\s*Boolean\(existing\?\.processed_at\)/);
  });

  it('markWebhookProcessed exists and never throws on failure', () => {
    expect(LIB).toMatch(/export async function markWebhookProcessed/);
    expect(LIB).toMatch(/idempotency\.mark_processed\.failed/);
  });

  it('cleanup NEVER sweeps unprocessed rows (dead letters are durable)', () => {
    expect(LIB).toMatch(/\.not\(['"]processed_at['"],\s*['"]is['"],\s*null\)/);
  });

  it('helper client comes from the service-client chokepoint', () => {
    expect(LIB).toMatch(/from ['"]@\/lib\/db\/service-client['"]/);
    expect(LIB).not.toMatch(/from ['"]@\/lib\/supabase\/server['"]/);
  });
});

describe('W4.2 — sms-reply: reprocess, mark, or die retryably', () => {
  it('signature validation still precedes the idempotency write (CRACK 102 order)', () => {
    const sig = SMS.indexOf('validateTwilioSignature(');
    const idem = SMS.indexOf('checkAndRecordWebhookIdempotency(');
    expect(sig).toBeGreaterThan(-1);
    expect(idem).toBeGreaterThan(sig);
  });

  it('the form payload rides the idempotency record', () => {
    expect(SMS).toMatch(/checkAndRecordWebhookIdempotency\([\s\S]*?formParams,\s*\)/);
  });

  it('processed replays short-circuit; unfinished replays REPROCESS', () => {
    expect(SMS).toMatch(/duplicate && processed/);
    expect(SMS).toMatch(/duplicate && !processed/);
    expect(SMS).toMatch(/webhook\.replay\.reprocessing_unfinished/);
  });

  it('success marks the delivery processed with the parsed outcome', () => {
    expect(SMS).toMatch(/markWebhookProcessed\(['"]twilio['"],\s*messageSid,\s*outcome\)/);
    expect(SMS).toMatch(/outcome = parsed\.action/);
  });

  it('a processing throw returns 500 (Twilio retries) without marking', () => {
    expect(SMS).toMatch(/webhook\.twilio\.processing_failed/);
    expect(SMS).toMatch(/status:\s*500/);
    const catchIdx = SMS.indexOf('webhook.twilio.processing_failed');
    const markIdx = SMS.indexOf('markWebhookProcessed(');
    expect(markIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeLessThan(catchIdx);
  });
});

describe('W4.3 — dead letters are surfaced, not lost', () => {
  it('substrate-health records webhook_delivery_twilio GREEN/RED', () => {
    expect(HEALTH).toMatch(/check_name:\s*['"]webhook_delivery_twilio['"]/);
    expect(HEALTH).toMatch(/\.eq\(['"]source['"],\s*['"]twilio['"]\)/);
    expect(HEALTH).toMatch(/\.is\(['"]processed_at['"],\s*null\)/);
  });

  it('overall ok requires BOTH anchor and webhook checks green', () => {
    expect(HEALTH).toMatch(/status === ['"]GREEN['"] && dlStatus === ['"]GREEN['"]/);
  });
});
