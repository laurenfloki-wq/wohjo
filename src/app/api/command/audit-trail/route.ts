// Flostruction Command — Audit Trail API
// GET /api/command/audit-trail?worker_id=[id]&shift_id=[id]
// Returns WLES events for a worker's shift chain + hash chain verification.

import { NextResponse } from 'next/server';
import { shiftEventsRepo } from '@/lib/db/repositories/shifts.repo';
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
  let workerId = url.searchParams.get('worker_id');
  const shiftId = url.searchParams.get('shift_id');

  if (!workerId && !shiftId) {
    return NextResponse.json({ error: 'worker_id or shift_id required' }, { status: 400 });
  }

  const evRepo = shiftEventsRepo(companyId);

  // The receipt drawer holds only a shift_id. Resolve the worker from the
  // shift's events (company-scoped) so we can verify the FULL worker chain —
  // verifying a single shift's events in isolation isn't a valid chain
  // check (the first event's previous_event_hash points outside the subset).
  if (!workerId && shiftId) {
    const { data: shiftEvents, error: shiftErr } = await evRepo.listShiftChain(shiftId);
    if (shiftErr) {
      return NextResponse.json({ error: shiftErr.message }, { status: 500 });
    }
    workerId = (shiftEvents ?? [])[0]?.worker_id ?? null;
    // No events for this shift (or a cross-tenant probe filtered to zero):
    // an empty chain is intact — there is nothing to compromise.
    if (!workerId) {
      return NextResponse.json({
        events: [],
        chain_intact: true,
        chain_failure: null,
        total_events: 0,
      });
    }
  }

  if (!workerId) {
    return NextResponse.json({ error: 'worker_id or shift_id required' }, { status: 400 });
  }

  // GAP-A3-001 closure: scope shift_events to the session's company_id.
  // Even with worker_id supplied by client, a cross-tenant probe gets
  // filtered to zero events. (2026-06-10, CP-1 slice 2a: the scoped
  // query relocated verbatim into shiftEventsRepo(companyId).)
  const query = evRepo.listWorkerChain(workerId);

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
  const chainEvents = (events ?? []).map(
    (ev: {
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
    }),
  );

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
          detail: chainResult.valid ? null : (chainResult.detail ?? null),
          index: chainResult.valid ? null : chainResult.index,
          event_id: chainResult.valid ? null : (chainResult.eventId ?? null),
        },
    total_events: filteredEvents.length,
  });
}
