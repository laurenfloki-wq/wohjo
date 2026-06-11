// Flosmosis — Rotate Verify Tokens Cron
// GET /api/cron/rotate-verify-tokens
// Runs daily at 14:00 UTC (00:00 AEST winter / 01:00 AEDT summer) via Vercel cron.
// Decision 8B (CRACK 122 closure) — moved from weekly to daily.
// Regenerates verify_token for all active supervisors.
// Does NOT invalidate sessions — only token for new links.

// CREDENTIAL REQUIRED: CRON_SECRET

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): SYSTEM surface — cross-company BY DESIGN
// (CRON_SECRET-gated cron schedule, sessionless). Uses the deliberately
// loud system accessor per the chokepoint discipline (PR #71
// precedent); queries unchanged.
import { getServiceClientForSystemJob } from '@/lib/db/service-client';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/cron/rotate-verify-tokens',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'GET' }, 'request.received');
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClientForSystemJob();

  try {
    // Fetch all active supervisors
    const { data: supervisors, error } = await supabase
      .from('supervisors')
      .select('id')
      .eq('is_active', true);

    if (error) throw new Error(error.message);

    let rotated = 0;
    for (const sup of supervisors ?? []) {
      // Generate new UUID for verify_token via Supabase SQL
      const { error: updateError } = await supabase
        .rpc('gen_random_uuid_update', {
          supervisor_id: sup.id,
        })
        .maybeSingle();

      // Fallback: direct update if RPC not available
      if (updateError) {
        // Use a crypto-random UUID from Node
        const { randomUUID } = await import('crypto');
        await supabase.from('supervisors').update({ verify_token: randomUUID() }).eq('id', sup.id);
      }
      rotated++;
    }

    return NextResponse.json({
      status: 'complete',
      rotated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // CRACK 236 observability — surface cron failures to Vercel ERROR logs.
    log.error({ err: message }, 'cron.rotate_verify_tokens.failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
