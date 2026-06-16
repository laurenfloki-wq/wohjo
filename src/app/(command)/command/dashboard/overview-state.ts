// Overview state aggregation for the /command Overview page.
//
// Pulls everything Mo needs to land on a single screen and feel that
// the substrate is in his hands: action queue (needs his decision),
// export readiness, this-week roll-up, live-now if anyone's on shift.
// Every read is company-scoped via `.eq('company_id', companyId)`.
//
// Sibling to `counters.ts` rather than an extension so the existing
// counter contract + test stay untouched.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface NeedsAttentionItem {
  shift_id: string;
  worker_name: string;
  reason: 'pending_supervisor' | 'pending_payroll' | 'flagged' | 'disputed';
  reason_label: string;
  hours: number;
  site_name: string | null;
  shift_date: string;
  href: string;
}

export interface ExportReadinessBlocker {
  worker_id: string;
  worker_name: string;
  blocker: 'missing_myob_card';
  blocker_label: string;
  href: string;
}

export interface LiveShift {
  shift_id: string;
  worker_name: string;
  site_name: string | null;
  start_time: string;
}

export interface OverviewState {
  /** True when the company has zero workers AND zero sites (true blank slate). */
  isBlankSlate: boolean;
  workers_total: number;
  sites_total: number;
  /** PAYROLL_APPROVED shifts ready to ship in the current pay period. */
  ready_to_export_count: number;
  ready_to_export_hours: number;
  pay_period_start: string;
  pay_period_end: string;
  /** Action queue — caller surfaces these as the dispatch's "Needs your attention". */
  needs_attention: NeedsAttentionItem[];
  /** Export-readiness blockers — surface BEFORE export time, never AT export time. */
  export_blockers: ExportReadinessBlocker[];
  /** Quiet "this week" strip. */
  week_shifts_verified: number;
  week_hours_verified: number;
  week_workers_active: number;
  week_sites_active: number;
  /** Live-now: only render if non-empty. */
  live_shifts: LiveShift[];
}

const ZERO_DATE = '1970-01-01';

/** Monday of the current week (UTC) as YYYY-MM-DD. Sunday wraps back. */
export function payPeriodStart(now: Date = new Date()): string {
  const d = new Date(now);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().split('T')[0];
}

/** Sunday end of the current pay-period week, ISO date. */
export function payPeriodEnd(now: Date = new Date()): string {
  const start = new Date(`${payPeriodStart(now)}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().split('T')[0];
}

function workerName(w: {
  first_name?: string | null;
  last_name?: string | null;
  employee_id?: string | null;
}): string {
  const full = [w.first_name, w.last_name].filter(Boolean).join(' ').trim();
  return full || (w.employee_id ?? 'Worker');
}

export async function loadOverviewState(
  supabase: SupabaseClient,
  companyId: string,
  now: Date = new Date(),
): Promise<OverviewState> {
  const periodStart = payPeriodStart(now);
  const periodEnd = payPeriodEnd(now);

  const [
    workersAll,
    sitesAll,
    sitesActive,
    shiftsThisPeriod,
    pendingSupervisor,
    pendingPayroll,
    flagged,
    disputed,
    liveShifts,
    workersMissingMyob,
  ] = await Promise.all([
    supabase
      .from('workers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
    supabase.from('sites').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase
      .from('sites')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true),
    supabase
      .from('shifts')
      .select('id, total_hours, status, worker_id, site_id, shift_date, anomaly_flags')
      .eq('company_id', companyId)
      .gte('shift_date', periodStart)
      .lte('shift_date', periodEnd),
    supabase
      .from('shifts')
      .select('id, worker_id, site_id, total_hours, shift_date, anomaly_flags')
      .eq('company_id', companyId)
      .eq('status', 'SUBMITTED')
      .gte('shift_date', periodStart)
      .order('shift_date', { ascending: false })
      .limit(20),
    supabase
      .from('shifts')
      .select('id, worker_id, site_id, total_hours, shift_date, anomaly_flags')
      .eq('company_id', companyId)
      .eq('status', 'SUPERVISOR_APPROVED')
      .gte('shift_date', periodStart)
      .order('shift_date', { ascending: false })
      .limit(20),
    supabase
      .from('shifts')
      .select('id, worker_id, site_id, total_hours, shift_date, anomaly_flags')
      .eq('company_id', companyId)
      .eq('status', 'FLAGGED')
      .order('shift_date', { ascending: false })
      .limit(20),
    supabase
      .from('shifts')
      .select('id, worker_id, site_id, total_hours, shift_date, anomaly_flags')
      .eq('company_id', companyId)
      .eq('status', 'DISPUTED')
      .order('shift_date', { ascending: false })
      .limit(20),
    supabase
      .from('shifts')
      .select('id, worker_id, site_id, start_time')
      .eq('company_id', companyId)
      .eq('status', 'IN_PROGRESS')
      .order('start_time', { ascending: false })
      .limit(10),
    supabase
      .from('workers')
      .select('id, first_name, last_name, employee_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .or('myob_card_id.is.null,myob_card_id.eq.'),
  ]);

  // Lookups for worker + site names — used by multiple sections.
  const workerIds = new Set<string>(
    [
      ...((pendingSupervisor.data ?? []) as Array<{ worker_id?: string | null }>).map(
        (r) => r.worker_id ?? '',
      ),
      ...((pendingPayroll.data ?? []) as Array<{ worker_id?: string | null }>).map(
        (r) => r.worker_id ?? '',
      ),
      ...((flagged.data ?? []) as Array<{ worker_id?: string | null }>).map(
        (r) => r.worker_id ?? '',
      ),
      ...((disputed.data ?? []) as Array<{ worker_id?: string | null }>).map(
        (r) => r.worker_id ?? '',
      ),
      ...((liveShifts.data ?? []) as Array<{ worker_id?: string | null }>).map(
        (r) => r.worker_id ?? '',
      ),
    ].filter(Boolean),
  );
  const siteIds = new Set<string>(
    [
      ...((pendingSupervisor.data ?? []) as Array<{ site_id?: string | null }>).map(
        (r) => r.site_id ?? '',
      ),
      ...((pendingPayroll.data ?? []) as Array<{ site_id?: string | null }>).map(
        (r) => r.site_id ?? '',
      ),
      ...((flagged.data ?? []) as Array<{ site_id?: string | null }>).map((r) => r.site_id ?? ''),
      ...((disputed.data ?? []) as Array<{ site_id?: string | null }>).map((r) => r.site_id ?? ''),
      ...((liveShifts.data ?? []) as Array<{ site_id?: string | null }>).map(
        (r) => r.site_id ?? '',
      ),
    ].filter(Boolean),
  );

  const workersById: Record<
    string,
    { first_name?: string | null; last_name?: string | null; employee_id?: string | null }
  > = {};
  if (workerIds.size > 0) {
    const { data: ws } = await supabase
      .from('workers')
      .select('id, first_name, last_name, employee_id')
      .in('id', Array.from(workerIds));
    (ws ?? []).forEach(
      (w: {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        employee_id?: string | null;
      }) => {
        workersById[w.id] = w;
      },
    );
  }
  const sitesById: Record<string, { name?: string | null }> = {};
  if (siteIds.size > 0) {
    const { data: ss } = await supabase
      .from('sites')
      .select('id, name')
      .in('id', Array.from(siteIds));
    (ss ?? []).forEach((s: { id: string; name?: string | null }) => {
      sitesById[s.id] = s;
    });
  }

  function nameForWorker(id: string | null | undefined): string {
    if (!id) return 'Worker';
    const w = workersById[id];
    return w ? workerName(w) : 'Worker';
  }
  function nameForSite(id: string | null | undefined): string | null {
    if (!id) return null;
    return sitesById[id]?.name ?? null;
  }

  function isFlagged(row: { anomaly_flags?: unknown }): boolean {
    const flags = row.anomaly_flags;
    if (!Array.isArray(flags)) return false;
    return flags.some(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        'severity' in f &&
        (f as { severity?: string }).severity === 'HIGH',
    );
  }

  const needs_attention: NeedsAttentionItem[] = [
    ...(
      (flagged.data ?? []) as Array<{
        id: string;
        worker_id?: string | null;
        site_id?: string | null;
        total_hours?: string | null;
        shift_date: string;
        anomaly_flags?: unknown;
      }>
    ).map((s) => ({
      shift_id: s.id,
      worker_name: nameForWorker(s.worker_id),
      reason: 'flagged' as const,
      reason_label: 'Flagged — needs your review',
      hours: parseFloat(s.total_hours ?? '0'),
      site_name: nameForSite(s.site_id),
      shift_date: s.shift_date,
      href: '/command/approvals?filter=needs_review',
    })),
    ...(
      (disputed.data ?? []) as Array<{
        id: string;
        worker_id?: string | null;
        site_id?: string | null;
        total_hours?: string | null;
        shift_date: string;
      }>
    ).map((s) => ({
      shift_id: s.id,
      worker_name: nameForWorker(s.worker_id),
      reason: 'disputed' as const,
      reason_label: 'Disputed — worker raised an issue',
      hours: parseFloat(s.total_hours ?? '0'),
      site_name: nameForSite(s.site_id),
      shift_date: s.shift_date,
      href: '/command/approvals?filter=needs_review',
    })),
    ...(
      (pendingPayroll.data ?? []) as Array<{
        id: string;
        worker_id?: string | null;
        site_id?: string | null;
        total_hours?: string | null;
        shift_date: string;
        anomaly_flags?: unknown;
      }>
    ).map((s) => ({
      shift_id: s.id,
      worker_name: nameForWorker(s.worker_id),
      reason: 'pending_payroll' as const,
      reason_label: isFlagged(s)
        ? 'Pending final approval — review the flags'
        : 'Pending final approval',
      hours: parseFloat(s.total_hours ?? '0'),
      site_name: nameForSite(s.site_id),
      shift_date: s.shift_date,
      href: '/command/approvals',
    })),
    ...(
      (pendingSupervisor.data ?? []) as Array<{
        id: string;
        worker_id?: string | null;
        site_id?: string | null;
        total_hours?: string | null;
        shift_date: string;
      }>
    ).map((s) => ({
      shift_id: s.id,
      worker_name: nameForWorker(s.worker_id),
      reason: 'pending_supervisor' as const,
      reason_label: 'Awaiting supervisor approval',
      hours: parseFloat(s.total_hours ?? '0'),
      site_name: nameForSite(s.site_id),
      shift_date: s.shift_date,
      href: '/command/approvals',
    })),
  ];

  const export_blockers: ExportReadinessBlocker[] = (
    (workersMissingMyob.data ?? []) as Array<{
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      employee_id?: string | null;
    }>
  ).map((w) => ({
    worker_id: w.id,
    worker_name: workerName(w),
    blocker: 'missing_myob_card' as const,
    blocker_label: 'No MYOB card id — payroll export will fall back to employee id',
    href: '/command/workers',
  }));

  const periodShifts = (shiftsThisPeriod.data ?? []) as Array<{
    id: string;
    total_hours: string | null;
    status: string;
    worker_id: string | null;
  }>;
  const ready = periodShifts.filter((s) => s.status === 'PAYROLL_APPROVED');
  const ready_to_export_count = ready.length;
  const ready_to_export_hours = ready.reduce((sum, s) => sum + parseFloat(s.total_hours ?? '0'), 0);

  const verifiedStatuses = new Set(['SUPERVISOR_APPROVED', 'PAYROLL_APPROVED']);
  const verified = periodShifts.filter((s) => verifiedStatuses.has(s.status));
  const week_shifts_verified = verified.length;
  const week_hours_verified = verified.reduce(
    (sum, s) => sum + parseFloat(s.total_hours ?? '0'),
    0,
  );
  const week_workers_active = new Set(periodShifts.map((s) => s.worker_id).filter(Boolean)).size;
  const week_sites_active = sitesActive.count ?? 0;

  const live_shifts: LiveShift[] = (
    (liveShifts.data ?? []) as Array<{
      id: string;
      worker_id?: string | null;
      site_id?: string | null;
      start_time?: string | null;
    }>
  ).map((s) => ({
    shift_id: s.id,
    worker_name: nameForWorker(s.worker_id),
    site_name: nameForSite(s.site_id),
    start_time: s.start_time ?? ZERO_DATE,
  }));

  return {
    isBlankSlate: (workersAll.count ?? 0) === 0 && (sitesAll.count ?? 0) === 0,
    workers_total: workersAll.count ?? 0,
    sites_total: sitesAll.count ?? 0,
    ready_to_export_count,
    ready_to_export_hours,
    pay_period_start: periodStart,
    pay_period_end: periodEnd,
    needs_attention,
    export_blockers,
    week_shifts_verified,
    week_hours_verified,
    week_workers_active,
    week_sites_active,
    live_shifts,
  };
}
