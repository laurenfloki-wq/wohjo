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
        // SUPERVISOR_APPROVED included so /today can surface the shifts that
        // are actually waiting on the director (payroll approval). SUBMITTED
        // shifts are still awaiting the supervisor, not the director.
        .in('status', ['IN_PROGRESS', 'SUBMITTED', 'SUPERVISOR_APPROVED'])
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
    .select('id, matches, expected_count, actual_count, recomputed_at, bound_at, scope_text');
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

/** People page reads (Phase 2). */
export function peopleRepo(companyId: string) {
  const db = getServiceClient();
  return {
    listWorkers: () =>
      db
        .from('workers')
        .select('id, first_name, last_name, phone, created_at, is_active')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),

    /** All shift hours for lifetime aggregation — status + hours only. */
    allShiftHours: () =>
      db
        .from('shifts')
        .select('worker_id, total_hours, status')
        .eq('company_id', companyId)
        .limit(10000),

    listSupervisors: () =>
      db
        .from('supervisors')
        .select(
          'id, name, phone, is_active, created_at, pending_sms_approval_ids, last_batch_sms_sent_at',
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),
  };
}

/** Pay runs page reads (Phase 2). */
export function payRunsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    getExportById: (exportId: string) =>
      db
        .from('exports')
        .select(
          'id, exported_at, pay_period_start, pay_period_end, total_hours, total_shifts, export_target, file_hash, shift_ids, exported_by',
        )
        .eq('id', exportId)
        .eq('company_id', companyId)
        .maybeSingle(),

    shiftsByIds: (ids: string[]) =>
      db
        .from('shifts')
        .select(
          'id, company_id, worker_id, site_id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, worker_note, workers(first_name, last_name, employee_id, pay_rate), sites(name)',
        )
        .eq('company_id', companyId)
        .in('id', ids)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true }),

    listExports: () =>
      db
        .from('exports')
        .select(
          'id, exported_at, pay_period_start, pay_period_end, total_hours, total_shifts, export_target',
        )
        .eq('company_id', companyId)
        .order('exported_at', { ascending: false })
        .limit(24),

    /** export_packs carries no company_id by design — rows are keyed by
     *  export_id values that came from the company-scoped exports read
     *  above (id-keyed post-scope, W2.2 precedent). */
    packsByExportIds: (ids: string[]) =>
      db
        .from('export_packs')
        .select('export_id, pack_fingerprint, generated_at')
        .in('export_id', ids),
  };
}

/** Sites page reads (Phase 2). */
export function sitesPageRepo(companyId: string) {
  const db = getServiceClient();
  return {
    listSites: () =>
      db
        .from('sites')
        .select('id, name, address, site_code, geofence_radius_metres, is_active, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true }),
  };
}

/** The record page reads (Phase 2). */
export function recordRepo(companyId: string) {
  const db = getServiceClient();
  return {
    recentEventsWithHash: (limit: number) =>
      db
        .from('shift_events')
        .select('id, event_type, created_at, event_data, event_hash, spec_version, worker_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit),

    /** Paged + searchable record list. Search matches event type and the
     *  payload receipt_id (PostgREST or-filter wildcards use *). */
    eventsPage: (args: { limit: number; offset: number; q: string | null }) => {
      let query = db
        .from('shift_events')
        .select('id, event_type, created_at, event_data, event_hash, spec_version, worker_id', {
          count: 'exact',
        })
        .eq('company_id', companyId);
      if (args.q) {
        const esc = args.q
          .replace(/[,*()%]/g, ' ')
          .trim()
          .slice(0, 60);
        if (esc.length > 0) {
          query = query.or(`event_type.ilike.*${esc}*,event_data->>receipt_id.ilike.*${esc}*`);
        }
      }
      return query
        .order('created_at', { ascending: false })
        .range(args.offset, args.offset + args.limit - 1);
    },

    /** Full single event for the evidence viewer (company-scoped). */
    eventById: (id: string) =>
      db
        .from('shift_events')
        .select(
          'id, company_id, worker_id, site_id, event_type, event_data, device_metadata, event_hash, previous_event_hash, created_at, created_by, spec_version',
        )
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),
  };
}
