import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

import { routeLogger } from '@/lib/logger';
// Flosmosis keep-alive cron — runs every 5 days via Vercel cron
// Prevents Supabase free-tier auto-pause
// Secured by CRON_SECRET via Vercel-canonical Authorization: Bearer pattern
//
// Canonical response contract (locked 2026-04-28; auth standardised
// 2026-04-29 per substrate-DD audit):
//   200: { status: 'alive', pinged_at: ISO8601, companies_count: number }
//   401: { error: 'Unauthorized' }   when Authorization header missing/wrong
//   500: { error: string }           when Supabase round-trip fails
// scripts/post-deploy-smoke-test.sh asserts on the "alive" sentinel.
// If you change this shape, update the grep AND the comment in that
// script at the same time.

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/keepalive', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  const authHeader = request.headers.get('authorization');

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    // Lightweight ping — count companies (almost always empty in early stage)
    const { count, error } = await supabase
      .from('companies')
      .select('id', { count: 'exact', head: true });

    if (error) throw error;

    return NextResponse.json({
      status: 'alive',
      pinged_at: new Date().toISOString(),
      companies_count: count ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
