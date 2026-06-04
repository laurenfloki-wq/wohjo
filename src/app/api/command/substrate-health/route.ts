// FLOSTRUCTION /command — substrate health endpoint.
// Powers TrustBar. Computes integrity LIVE on every call so the
// director's heartbeat reads "just now / Xm ago" — never days stale.
//
// Sources of truth, in order:
//   1. Live count of broken chain links (count_broken_chain_links() —
//      SECURITY DEFINER, service_role only after the housekeeping
//      revoke; v0 + v1 in one pass).
//   2. Live sealed-count over shift_events.
//   3. `substrate_health_log` — kept as a historical floor, used ONLY
//      if the live check fails to produce a definitive answer. The
//      heartbeat never appears more recent than the live computation
//      it just ran.
//
// Auth: getCompanyIdForSession (canonical Class-A /command auth).
// Writes nothing.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: 'intact' | 'review' | 'flagged' | 'unknown';
  sealed_count: number;
  /** ISO timestamp of the most recent integrity check. Set to `now` on a
   *  successful live verification — this is the canonical freshness
   *  signal the TrustBar renders. */
  last_verified_at: string | null;
  /** Optional ISO timestamp of the prior automated audit (cron). Quiet
   *  context only — not rendered as the freshness signal. */
  last_cron_verified_at?: string | null;
  broken_links: number;
  message?: string | undefined;
  source: 'live' | 'log' | 'unknown';
}

export async function GET() {
  const log = routeLogger('GET /api/command/substrate-health', null);
  try {
    await getCompanyIdForSession(log);
  } catch (err) {
    if (isAuthorizationError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const body: HealthResponse = {
      status: 'unknown', sealed_count: 0, last_verified_at: null, broken_links: 0,
      message: 'Substrate connection not configured.', source: 'unknown',
    };
    return NextResponse.json(body);
  }
  const svc = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // LIVE — run both checks in parallel.
  const [brokenRes, countRes, healthRowRes] = await Promise.all([
    svc.rpc('count_broken_chain_links').single(),
    svc.from('shift_events').select('id', { count: 'exact', head: true }),
    svc.from('substrate_health_log')
       .select('run_at, status')
       .order('run_at', { ascending: false })
       .limit(1)
       .maybeSingle(),
  ]);

  const broken = (brokenRes.data as { n: number } | null)?.n ?? null;
  const sealedCount = countRes.count ?? 0;
  const lastCronRun = healthRowRes.data?.run_at ?? null;

  // Live verdict — preferred. If the live check completed and the chain
  // is clean, the heartbeat is fresh as of NOW.
  let body: HealthResponse;
  if (broken === 0) {
    body = {
      status: 'intact',
      sealed_count: sealedCount,
      last_verified_at: new Date().toISOString(),
      last_cron_verified_at: lastCronRun,
      broken_links: 0,
      source: 'live',
    };
  } else if (broken != null && broken > 0) {
    body = {
      status: 'flagged',
      sealed_count: sealedCount,
      last_verified_at: new Date().toISOString(),
      last_cron_verified_at: lastCronRun,
      broken_links: broken,
      message: `Chain integrity needs attention (${broken} broken links).`,
      source: 'live',
    };
  } else {
    // Live check inconclusive — fall back to the historical log.
    const cronStatus = healthRowRes.data?.status;
    let status: HealthResponse['status'] = 'unknown';
    if (cronStatus === 'GREEN') status = 'intact';
    else if (cronStatus === 'AMBER' || cronStatus === 'REVIEW') status = 'review';
    else if (cronStatus === 'RED' || cronStatus === 'FAIL') status = 'flagged';
    body = {
      status,
      sealed_count: sealedCount,
      last_verified_at: lastCronRun,
      last_cron_verified_at: lastCronRun,
      broken_links: broken ?? 0,
      message: status === 'unknown' ? 'Re-checking integrity…' : undefined,
      source: cronStatus ? 'log' : 'unknown',
    };
  }

  return NextResponse.json(body);
}
