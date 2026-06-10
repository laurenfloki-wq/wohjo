// Flostruction — Shifts / Shift-events repositories (CP-1 slice 2a, 2026-06-10)
//
// Read-path factories for the money-path tables. Scope is bound at the
// factory; query shapes (selects incl. joined relations, predicates,
// orderings, limits) are byte-identical to the previous route inlines.
// The mutation seam (shiftAuthLookup + paired guards, spine-approved
// 2026-06-10) lands in sub-slice 2b — NOT here.

import { getServiceClient } from '@/lib/db/service-client';

/** Company-scoped shifts reads for command routes. */
export function shiftsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // command/intelligence — joined select relocated verbatim.
    listForIntelligence: (fromDateStr: string, limit: number) =>
      db
        .from('shifts')
        .select(`
      id, receipt_id, shift_date, total_hours, status,
      confidence_score, anomaly_flags, worker_id, site_id,
      workers!inner (first_name, last_name),
      sites (name)
    `)
        .eq('company_id', companyId)
        .gte('shift_date', fromDateStr)
        .order('shift_date', { ascending: false })
        .limit(limit),

    // command/super-evidence — joined select relocated verbatim.
    listForSuperEvidence: (start: string, end: string) =>
      db
        .from('shifts')
        .select(`
      id, worker_id, shift_date, total_hours, receipt_id, status,
      workers!inner(first_name, last_name, employee_id)
    `)
        .eq('company_id', companyId)
        .gte('shift_date', start)
        .lte('shift_date', end)
        .in('status', ['SUPERVISOR_APPROVED', 'PAYROLL_APPROVED', 'EXPORTED'])
        .order('shift_date', { ascending: true }),
  };
}

/** Company-scoped shift_events reads for command routes. */
export function shiftEventsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // command/audit-trail — worker chain, relocated verbatim.
    listWorkerChain: (workerId: string) =>
      db
        .from('shift_events')
        .select('id, event_type, event_data, event_hash, previous_event_hash, company_id, worker_id, site_id, created_at, created_by')
        .eq('company_id', companyId)
        .eq('worker_id', workerId)
        .order('created_at', { ascending: true }),

    // command/intelligence — two call sites shared this shape with a
    // different event_type literal; parameterised, query bytes unchanged.
    listEventData: (eventType: string, workerIds: string[]) =>
      db
        .from('shift_events')
        .select('event_data')
        .eq('company_id', companyId)
        .eq('event_type', eventType)
        .in('worker_id', workerIds),

    // command/super-evidence — per-shift chain hashes, relocated verbatim.
    listShiftChainHashes: (workerId: string, shiftId: string) =>
      db
        .from('shift_events')
        .select('event_hash')
        .eq('company_id', companyId)
        .eq('worker_id', workerId)
        .filter('event_data->>shift_id', 'eq', shiftId)
        .order('created_at', { ascending: true }),
  };
}

/** Worker-self shifts reads for field routes (session-verified worker_id;
 *  no redundant company predicate — scope is the worker identity). */
export function workerShiftsSelfRepo(workerId: string) {
  const db = getServiceClient();
  return {
    // field/shifts/week — relocated verbatim.
    listWeek: (weekStart: string) =>
      db
        .from('shifts')
        .select('id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, anomaly_flags, worker_note')
        .eq('worker_id', workerId)
        .gte('shift_date', weekStart)
        .order('shift_date', { ascending: false }),
  };
}
