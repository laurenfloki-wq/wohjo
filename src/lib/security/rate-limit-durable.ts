// Flostruction — Durable Rate Limiter (finding B-ii, 2026-06-10)
//
// The module-level Map in rate-limit.ts resets per serverless cold
// start and is not shared across instances, so its limit is "N per
// warm instance", not global. This wrapper keeps that in-memory
// limiter as an L1 fast-path and backs it with the Postgres
// check_rate_limit() function (atomic upsert-and-count,
// SECURITY DEFINER, EXECUTE revoked from public/anon/authenticated)
// as the shared source of truth.
//
// Failure mode: if the DB call errors or is unavailable, we fail open
// to the L1 result. Rationale: the limiter guards OTP issuance and
// webhook ingestion — hard-failing them on a transient DB blip would
// turn a rate-limit backstop into an availability risk. The L1 limit
// still applies per instance in that window.

import { checkRateLimit, type RateLimitResult } from './rate-limit';
import { createServiceClient } from '@/lib/supabase/server';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface DurableRow {
  allowed: boolean;
  remaining: number;
  reset_at: string;
}

/**
 * Durable rate-limit check: L1 in-memory fast-path, Postgres backstop.
 * Apply to AUTH and WEBHOOK preset call sites (OTP issuance, Twilio
 * inbound, Stripe webhook). Same RateLimitResult contract as
 * checkRateLimit.
 */
export async function checkRateLimitDurable(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  // L1: cheap, per-instance. A deny here is always correct (the global
  // count is >= the local count), so skip the DB round-trip.
  const l1 = checkRateLimit(key, options);
  if (!l1.allowed) return l1;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_window_ms: options.windowMs,
      p_max: options.maxRequests,
    });
    if (error || !data) return l1;
    const row: DurableRow | undefined = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') return l1;
    return {
      allowed: row.allowed,
      remaining: row.remaining,
      resetAt: new Date(row.reset_at).getTime(),
    };
  } catch {
    // Fail open to L1 (documented above).
    return l1;
  }
}
