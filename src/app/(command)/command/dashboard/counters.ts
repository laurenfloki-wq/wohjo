// Dashboard counter aggregation — pure data-layer module.
//
// Extracted from page.tsx so that the tenant-isolation tests can
// import it without dragging in next/headers via the supabase server
// helpers. The function is generic over SupabaseClient so production
// passes a real service-role client and tests pass a mock.
//
// 2026-04-30 substrate-DD invariant: every count query MUST be
// scoped by `.eq('company_id', companyId)`. This module is the
// single place that owns the query shape; the dashboard page just
// renders the result. Tests pin the invariant in
// src/app/(command)/command/dashboard/counters.test.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DashboardCounters {
  activeWorkers: number;
  activeSites: number;
  weekHours: number;
  pendingApproval: number;
}

/**
 * Compute the four dashboard counters scoped to a single company_id.
 *
 * Every query includes `.eq('company_id', companyId)`. Even though
 * the page-layer always resolves companyId from the session before
 * calling this function, requiring the parameter at the type level
 * means a future caller cannot accidentally invoke this with a
 * forgotten/empty filter.
 */
export async function loadDashboardCounters(
  supabase: SupabaseClient,
  companyId: string,
): Promise<DashboardCounters> {
  const [workersResult, sitesResult, shiftsResult, pendingResult] = await Promise.all([
    supabase
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('company_id', companyId),
    supabase
      .from('sites')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('company_id', companyId),
    supabase
      .from('shifts')
      .select('id, total_hours', { count: 'exact' })
      .gte('shift_date', getWeekStart())
      .eq('company_id', companyId),
    supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'SUBMITTED')
      .eq('company_id', companyId),
  ]);

  const activeWorkers = workersResult.count ?? 0;
  const activeSites = sitesResult.count ?? 0;
  const pendingApproval = pendingResult.count ?? 0;
  const weekShifts = (shiftsResult.data ?? []) as Array<{ total_hours: string | null }>;
  const weekHours = weekShifts.reduce(
    (sum: number, s: { total_hours: string | null }) =>
      sum + parseFloat(s.total_hours ?? '0'),
    0,
  );

  return { activeWorkers, activeSites, weekHours, pendingApproval };
}

/**
 * Monday of the current week, ISO date (YYYY-MM-DD). Exported so
 * tests can pin it under fake timers. Sunday-as-day-0 wraparound is
 * handled by treating Sunday as the previous week's Monday + 6.
 */
export function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}
