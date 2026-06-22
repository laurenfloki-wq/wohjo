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
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
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
  /** OBS-4 — operational checks whose latest run is RED (email/cron/etc).
   *  Lets the TrustBar reflect a worst-of view instead of a chain-only
   *  false all-clear. Empty/omitted when everything operational is GREEN. */
  failing_checks?: string[];
}

// OBS-4 — operational health checks to roll into the TrustBar worst-of. The
// two raw chain_integrity_shift_events* checks are intentionally excluded: the
// live broken-links count above is the authoritative chain signal, and the raw
// log check carries known-baseline noise.
const OPERATIONAL_CHECKS: ReadonlySet<string> = new Set([
  'notification_outbound',
  'webhook_delivery_twilio',
  'webhook_delivery_stripe',
  'webhook_delivery_supabase_auth',
  'advisor_sweep',
  'error_rate',
  'cron_health',
  'cron_health_substrate',
  'shift_commit_completeness',
  'chain_count_anchor',
  'anchor_fingerprint',
]);

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
      status: 'unknown',
      sealed_count: 0,
      last_verified_at: null,
      broken_links: 0,
      message: 'Substrate connection not configured.',
      source: 'unknown',
    };
    return NextResponse.json(body);
  }
  const svc = getServiceClientForSystemJob();

  // LIVE — run the checks in parallel.
  const [brokenRes, countRes, healthRowRes, opChecksRes] = await Promise.all([
    svc.rpc('count_broken_chain_links').single(),
    svc.from('shift_events').select('id', { count: 'exact', head: true }),
    svc
      .from('substrate_health_log')
      .select('run_at, status')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // OBS-4 — latest status of every operational check in the last 48h.
    svc
      .from('substrate_health_log')
      .select('check_name, status, run_at')
      .gte('run_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('run_at', { ascending: false })
      .limit(300),
  ]);

  const broken = (brokenRes.data as { n: number } | null)?.n ?? null;
  const sealedCount = countRes.count ?? 0;
  const lastCronRun = healthRowRes.data?.run_at ?? null;

  // OBS-4 — worst-of: which operational checks are RED on their most recent run.
  // Best-effort: a read failure never fabricates a problem (stays empty).
  const failingChecks: string[] = (() => {
    if (opChecksRes.error || !opChecksRes.data) return [];
    const latest = new Map<string, string>();
    for (const r of opChecksRes.data as Array<{ check_name: string; status: string }>) {
      if (!latest.has(r.check_name)) latest.set(r.check_name, r.status);
    }
    return [...latest.entries()]
      .filter(([name, st]) => OPERATIONAL_CHECKS.has(name) && st === 'RED')
      .map(([name]) => name)
      .sort();
  })();

  // Live verdict — preferred. If the live check completed and the chain
  // is clean, the heartbeat is fresh as of NOW.
  let body: HealthResponse;
  if (broken === 0) {
    // Chain is intact live. OBS-4 — but don't show a false all-clear if an
    // operational check (email delivery, a cron, etc.) is RED: downgrade to
    // 'review' so the operator sees it at a glance, with the failing checks named.
    body =
      failingChecks.length > 0
        ? {
            status: 'review',
            sealed_count: sealedCount,
            last_verified_at: new Date().toISOString(),
            last_cron_verified_at: lastCronRun,
            broken_links: 0,
            message: `Ledger intact — but ${failingChecks.length} background check(s) need attention: ${failingChecks.join(', ')}.`,
            source: 'live',
            failing_checks: failingChecks,
          }
        : {
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
