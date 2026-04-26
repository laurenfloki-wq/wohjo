import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

import { routeLogger } from '@/lib/logger';
// Flosmosis keep-alive cron — runs every 5 days via Vercel cron
// Prevents Supabase free-tier auto-pause
// Secured by CRON_SECRET header

export async function GET(request: Request) {
  const log = routeLogger('GET /api/cron/keepalive', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  const secret = request.headers.get('x-cron-secret') ?? new URL(request.url).searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
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
