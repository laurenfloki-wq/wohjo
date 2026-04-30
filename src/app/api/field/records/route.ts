// Flostruction Field — Records (history) API
// GET /api/field/records?cursor=<iso>&limit=<n>
//
// Returns the authenticated worker's historical shifts in reverse
// chronological order, scoped strictly to their own worker_id (cross-
// worker probes collapse to an empty result). Cursor pagination keyed
// on shift_date — pass the last seen date back as ?cursor=<iso> to
// load the next page.
//
// Records-substrate framing: this endpoint surfaces the worker's
// permanent labour record. Per worker FAQ "Tap 'My records' in the
// app. You'll see every shift you've ever worked through FLOSTRUCTION."
// (src/content/worker/faq.md:133-142). Built 2026-04-30 evening per
// labour-hire-workflow-gap-analysis-2026-04-29 §G11 (newly surfaced
// gap; FAQ claim was unmet pre-fix).
//
// Substrate-DD: every column in the SELECT projection is verified
// against src/db/migrations/0000_mature_husk.sql (genesis) and
// /api/field/home-data/route.ts (the existing precedent for shape).

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

interface ShiftRow {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  site_id: string | null;
  created_at: string;
}

interface SiteRow {
  id: string;
  name: string;
}

export interface RecordsResponse {
  shifts: Array<{
    id: string;
    shift_date: string;
    start_time: string;
    end_time: string | null;
    break_minutes: number | null;
    total_hours: string | null;
    status: string;
    receipt_id: string;
    site_name: string | null;
  }>;
  next_cursor: string | null;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/field/records', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let workerId: string;
  try {
    ({ workerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam
    ? Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT))
    : DEFAULT_LIMIT;

  const supabase = createServiceClient();

  // Cursor pagination keyed on shift_date. The cursor IS the last
  // shift_date seen; we ask for shifts with shift_date < cursor so
  // the next page picks up immediately after.
  let query = supabase
    .from('shifts')
    .select(
      'id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, site_id, created_at',
    )
    .eq('worker_id', workerId)
    .order('shift_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1); // fetch one extra to detect "more pages"

  if (cursor) {
    query = query.lt('shift_date', cursor);
  }

  const { data: rawShifts, error } = await query;

  if (error) {
    log.error({ err: error.message, workerId }, 'records.query_failed');
    return NextResponse.json({ error: 'Could not load records' }, { status: 500 });
  }

  const shifts = (rawShifts ?? []) as ShiftRow[];

  // "more pages" signal: if we fetched limit+1, drop the last and
  // surface its shift_date as the next cursor.
  const hasMore = shifts.length > limit;
  const trimmed = hasMore ? shifts.slice(0, limit) : shifts;
  const nextCursor = hasMore ? shifts[limit - 1].shift_date : null;

  // Resolve site names in one round trip.
  const siteIds = [...new Set(trimmed.map((s) => s.site_id).filter((id): id is string => Boolean(id)))];
  let siteMap = new Map<string, string>();
  if (siteIds.length > 0) {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name')
      .in('id', siteIds);
    siteMap = new Map((sites as SiteRow[] | null ?? []).map((s) => [s.id, s.name]));
  }

  const response: RecordsResponse = {
    shifts: trimmed.map((s) => ({
      id: s.id,
      shift_date: s.shift_date,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      total_hours: s.total_hours,
      status: s.status,
      receipt_id: s.receipt_id,
      site_name: s.site_id ? (siteMap.get(s.site_id) ?? null) : null,
    })),
    next_cursor: nextCursor,
  };

  return NextResponse.json(response);
}
