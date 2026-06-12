// Flostruction — Page paradigm repository (Phase 1, 2026-06-12)
//
// Read-side accessors for the warm-light operator surface. Company
// scope bound at the factory per the W1 confinement discipline; the
// two substrate reads at module scope are cross-company BY DESIGN
// (verification metadata, not tenant data) and deliberately loud.

import { getServiceClient } from '@/lib/db/service-client';

/** Company-scoped reads for the daily page. */
export function pageRepo(companyId: string) {
  const db = getServiceClient();
  return {
    /** Event stream behind the Handled section + archive count. */
    eventsSince: (sinceIso: string) =>
      db
        .from('shift_events')
        .select('id, event_type, created_at, event_data, worker_id, site_id')
        .eq('company_id', companyId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(400),

    /** All event days, for the archive capstone count (created_at only). */
    eventDays: () =>
      db
        .from('shift_events')
        .select('created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .limit(5000),

    /** Shifts for a date window — weekly verified-hours + states. */
    shiftsBetween: (fromDate: string, toDate: string) =>
      db
        .from('shifts')
        .select('id, status, total_hours, shift_date, receipt_id, worker_id, site_id, start_time')
        .eq('company_id', companyId)
        .gte('shift_date', fromDate)
        .lte('shift_date', toDate),

    /** The decision queue + on-site-now feed. */
    openAndPending: () =>
      db
        .from('shifts')
        .select(
          'id, status, start_time, end_time, total_hours, receipt_id, shift_date, worker_id, site_id',
        )
        .eq('company_id', companyId)
        .in('status', ['IN_PROGRESS', 'SUBMITTED'])
        .order('start_time', { ascending: false })
        .limit(60),

    /** Latest export, for the pay run card. */
    latestExport: () =>
      db
        .from('exports')
        .select(
          'id, exported_at, pay_period_start, pay_period_end, total_hours, total_shifts, export_target',
        )
        .eq('company_id', companyId)
        .order('exported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

    /** Display names for sentences — ids come from company-scoped rows. */
    workerNames: (ids: string[]) =>
      db
        .from('workers')
        .select('id, first_name, last_name')
        .eq('company_id', companyId)
        .in('id', ids),

    siteNames: (ids: string[]) =>
      db.from('sites').select('id, name').eq('company_id', companyId).in('id', ids),
  };
}

/** Substrate verification state — CROSS-COMPANY BY DESIGN. These read
 *  the integrity layer (anchors + health log), which carries no tenant
 *  rows; the chain line and the bad morning are derived here. Do not
 *  add tenant-data reads to these accessors. */
export function anchorVerification() {
  const db = getServiceClient();
  return db
    .from('v_anchor_verification')
    .select('id, matches, expected_count, actual_count, recomputed_at');
}

export function latestHealthChecks() {
  const db = getServiceClient();
  return db
    .from('substrate_health_log')
    .select('check_name, status, run_at, detail')
    .in('check_name', [
      'anchor_fingerprint',
      'chain_integrity_shift_events',
      'chain_integrity_shift_events_ex_baseline',
    ])
    .order('run_at', { ascending: false })
    .limit(30);
}
