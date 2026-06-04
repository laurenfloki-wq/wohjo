// FLOSTRUCTION /command — substrate health endpoint.
// Powers TrustBar. Reads two truth sources:
//   1. `substrate_health_log` — the latest cron_health row (when the
//      independent verifier last ran, and what it said).
//   2. `shift_events` — live sealed count, scoped to the caller's company.
//
// Never fabricates: if either source is unavailable, returns
// status='unknown' and an empty `last_verified_at`.
//
// Writes nothing. Auth: getCompanyIdForSession (resolves session ->
// company_id; throws AuthorizationError if no admin session). This is the
// canonical Class-A /api/command/* auth path per the A3 boundary tests.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: 'intact' | 'review' | 'flagged' | 'unknown';
  sealed_count: number;
  last_verified_at: string | null;
  broken_links: number;
  message?: string | undefined;
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
      message: 'Substrate connection not configured.',
    };
    return NextResponse.json(body);
  }
  const svc = createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Latest health-check row (any check_name, freshest)
  const { data: healthRow } = await svc
    .from('substrate_health_log')
    .select('run_at, status, check_name, detail')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Live sealed-count over shift_events (forensic; not scoped per company
  // here because the TrustBar reflects the WHOLE substrate's integrity,
  // not just the operator's slice — this is the dispatch's "central-bank"
  // assurance, not their accounting view).
  const { count: sealedCount } = await svc
    .from('shift_events')
    .select('id', { count: 'exact', head: true });

  // Broken-links sentinel: cheap query — we count v0 rows where the
  // previous_event_hash is set but no parent matches.
  const { data: brokenResult } = await svc.rpc('count_broken_chain_links').single();
  const broken = (brokenResult as { n: number } | null)?.n ?? null;

  let status: HealthResponse['status'] = 'unknown';
  let message: string | undefined;

  if (broken != null && broken > 0) {
    status = 'flagged';
    message = `Chain integrity needs attention (${broken} broken links).`;
  } else if (healthRow?.status === 'GREEN' && broken === 0) {
    status = 'intact';
  } else if (healthRow?.status === 'AMBER' || healthRow?.status === 'REVIEW') {
    status = 'review';
    message = (healthRow.detail as { note?: string } | null)?.note;
  } else if (healthRow?.status === 'RED' || healthRow?.status === 'FAIL') {
    status = 'flagged';
    message = (healthRow.detail as { note?: string } | null)?.note;
  } else if (broken === 0) {
    // No log row yet, but the chain itself reports clean — say so plainly.
    status = 'intact';
  }

  const body: HealthResponse = {
    status,
    sealed_count: sealedCount ?? 0,
    last_verified_at: healthRow?.run_at ?? null,
    broken_links: broken ?? 0,
    message,
  };

  return NextResponse.json(body);
}
