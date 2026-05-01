// Flostruction Command — Audit Trail API
// GET /api/command/audit-trail?worker_id=[id]&shift_id=[id]
// Returns WLES events for a worker's shift chain + hash chain verification.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyHashChainDetailed } from '@/lib/wles/hash';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/audit-trail', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const url = new URL(request.url);
  const workerId = url.searchParams.get('worker_id');
  const shiftId = url.searchParams.get('shift_id');

  if (!workerId) {
    return NextResponse.json({ error: 'worker_id required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // GAP-A3-001 closure: scope shift_events to the session's company_id.
  // Even with worker_id supplied by client, a cross-tenant probe gets
  // filtered to zero events (worker_id of another company + our
  // company_id filter = empty result).
  let query = supabase
    .from('shift_events')
    .select('id, event_type, event_data, event_hash, previous_event_hash, company_id, worker_id, site_id, created_at, created_by')
    .eq('company_id', companyId)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: true });

  if (shiftId) {
    // Filter events related to this specific shift
    // Events reference shift_id in event_data
    // For now, fetch all worker events and filter client-side
    // (Supabase JSONB filter: event_data->>'shift_id' = shiftId)
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If we have a shiftId, filter events that reference it
  let filteredEvents = events ?? [];
  if (shiftId) {
    filteredEvents = filteredEvents.filter((ev: { event_data: Record<string, unknown> }) => {
      const data = ev.event_data as Record<string, string>;
      return data?.shift_id === shiftId || !data?.shift_id;
    });
  }

  // Verify hash chain integrity
  const chainEvents = (events ?? []).map((ev: {
    id: string;
    event_hash: string;
    previous_event_hash: string | null;
    company_id: string;
    worker_id: string;
    site_id: string;
    event_type: string;
    event_data: Record<string, unknown>;
    created_at: string;
  }) => ({
    id: ev.id,
    event_hash: ev.event_hash,
    previous_event_hash: ev.previous_event_hash,
    company_id: ev.company_id,
    worker_id: ev.worker_id,
    site_id: ev.site_id,
    event_type: ev.event_type,
    event_data: ev.event_data as Record<string, unknown>,
    created_at: new Date(ev.created_at),
  }));

  const chainResult = verifyHashChainDetailed(chainEvents);
  // Empty chain treated as intact at this surface — a worker with no
  // events has nothing to compromise. Diagnostic-grade callers should
  // use verifyHashChainDetailed directly.
  const chainIntact = chainResult.valid || chainEvents.length === 0;

  return NextResponse.json({
    events: filteredEvents,
    chain_intact: chainIntact,
    chain_failure: chainIntact
      ? null
      : {
          reason: chainResult.valid ? null : chainResult.reason,
          detail: chainResult.valid ? null : chainResult.detail ?? null,
          index: chainResult.valid ? null : chainResult.index,
          event_id: chainResult.valid ? null : chainResult.eventId ?? null,
        },
    total_events: filteredEvents.length,
  });
}
