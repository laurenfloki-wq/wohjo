// Flostruction — Shifts / Shift-events repositories (CP-1 slice 2a, 2026-06-10)
//
// Read-path factories for the money-path tables. Scope is bound at the
// factory; query shapes (selects incl. joined relations, predicates,
// orderings, limits) are byte-identical to the previous route inlines.
// The mutation seam (shiftAuthLookup + paired guards, spine-approved
// 2026-06-10) lands in sub-slice 2b — NOT here.

import { getServiceClient } from '@/lib/db/service-client';
import type { Logger } from 'pino';
import { getV1ChainTail, insertV1Event } from '@/lib/wles/v1-chain';
import { checkDuplicateStartEvent } from '@/lib/wles/sync-guard';
import { emitAuthEvent } from '@/lib/auth/auth-events-emit';
import { emitGeofenceEvent } from '@/lib/intelligence/geofence-events-emit';

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

    // lib/export/get-approved-shifts — export-pipeline source query,
    // relocated verbatim (W1.3 2026-06-10) incl. both orderings.
    listApprovedForExport: (payPeriodStart: string, payPeriodEnd: string) =>
      db
        .from('shifts')
        .select(`
      id,
      company_id,
      worker_id,
      site_id,
      shift_date,
      start_time,
      end_time,
      break_minutes,
      total_hours,
      status,
      receipt_id,
      worker_note,
      workers(id, first_name, last_name, employee_id, pay_rate),
      sites(id, name)
    `)
        .eq('company_id', companyId)
        .eq('status', 'PAYROLL_APPROVED')
        .gte('shift_date', payPeriodStart)
        .lte('shift_date', payPeriodEnd)
        .order('shift_date', { ascending: true })
        .order('start_time', { ascending: true }),

    // exports/myob full pipeline (W1.3 part B) — pre-flight fetch by
    // ids, relocated verbatim.
    listForMyobExport: (shiftIds: string[]) =>
      db
        .from('shifts')
        .select(`
      id, company_id, worker_id, site_id,
      shift_date, start_time, end_time,
      break_minutes, total_hours, status,
      receipt_id, worker_note,
      workers(id, first_name, last_name, employee_id, pay_rate),
      sites(id, name)
    `)
        .eq('company_id', companyId)
        .in('id', shiftIds),

    // command/approvals (W1.4) — base query relocated verbatim; the
    // route applies its filter refinement (.in/.eq/.or) to the
    // returned builder, bytes unchanged.
    approvalsBaseQuery: () =>
      db
        .from('shifts')
        .select(
          `
      id, company_id, worker_id, site_id, shift_date, start_time, end_time,
      break_minutes, total_hours, receipt_id, status, confidence_score,
      anomaly_flags, supervisor_approved_by, supervisor_approved_at,
      payroll_approved_by, payroll_approved_at, created_at, updated_at,
      workers(id, first_name, last_name, employee_id, pay_rate),
      sites(id, name)
    `,
        )
        .eq('company_id', companyId)
        .order('shift_date', { ascending: false }),
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

    // field/earnings/week (W1.4) — relocated verbatim.
    listWeekHours: (weekStart: string) =>
      db
        .from('shifts')
        .select('total_hours, status')
        .eq('worker_id', workerId)
        .gte('shift_date', weekStart),

    // field/home-data (W1.4) — all relocated verbatim.
    lastSiteId: () =>
      db
        .from('shifts')
        .select('site_id')
        .eq('worker_id', workerId)
        .not('site_id', 'is', null)
        .order('shift_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    inProgress: () =>
      db
        .from('shifts')
        .select(
          'id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, site_id',
        )
        .eq('worker_id', workerId)
        .eq('status', 'IN_PROGRESS')
        .order('start_time', { ascending: false })
        .limit(1),
    listWeekWithAnomalies: (weekStart: string) =>
      db
        .from('shifts')
        .select(
          'id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, site_id, anomaly_flags',
        )
        .eq('worker_id', workerId)
        .gte('shift_date', weekStart)
        .order('shift_date', { ascending: false }),
    countAll: () =>
      db.from('shifts').select('id', { count: 'exact', head: true }).eq('worker_id', workerId),

    // field/records (W1.4) — base builder relocated verbatim; the route
    // passes limit+1 (pagination signal) and applies its conditional
    // .lt cursor refinement.
    recordsQuery: (limitPlusOne: number) =>
      db
        .from('shifts')
        .select(
          'id, shift_date, start_time, end_time, break_minutes, total_hours, status, receipt_id, site_id, created_at',
        )
        .eq('worker_id', workerId)
        .order('shift_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limitPlusOne),

    // field/receipt (W1.4) — cross-worker probes collapse to 404 via
    // the worker_id predicate; relocated verbatim.
    getByReceiptId: (receiptId: string) =>
      db
        .from('shifts')
        .select(`
      id, receipt_id, shift_date, start_time, end_time,
      break_minutes, total_hours, status, confidence_score,
      anomaly_flags, worker_note, worker_id, site_id, company_id,
      created_at
    `)
        .eq('receipt_id', receiptId)
        .eq('worker_id', workerId)
        .maybeSingle(),
  };
}

// ────────────────────────────────────────────────────────────────────
// CP-1 slice 2b (2026-06-10) — money-path mutation seams + factories.
// Spec: gate-reports/tier0-ship-gate-2026-06-10/SLICE2B-SPEC.md (incl.
// addendum). Everything below is pure indirection: query shapes are
// byte-identical to the four command/shifts mutation routes, except
// the spine-approved seams and the post-membership re-reads they
// require (the re-read is the point of the seam).
// ────────────────────────────────────────────────────────────────────


/**
 * SEAM (spine-approved 2026-06-10): unscoped fetch-then-authorize entry
 * point for the mutation routes. Column-minimised to id + company_id —
 * if a future caller ever omits the membership check, this leaks an id
 * and a company_id, never pay data. The ONLY legitimate caller pattern
 * is: shiftAuthLookup(...) immediately followed by
 * requireCompanyMembership(row.company_id). Paired-guard tests assert
 * this ordering per route.
 */
export function shiftAuthLookup(shiftId: string) {
  const db = getServiceClient();
  return db.from('shifts').select('id, company_id').eq('id', shiftId).single();
}

export interface ParentEventAuthResult {
  event: { id: string; company_id: string } | null;
  crossTenant: boolean;
}

/**
 * SEAM twin (addendum-pinned): correct/route.ts threads a correction
 * onto a parent shift_events row; the row is fetched unscoped by id and
 * its company must match the already-authorized shift's company. The
 * guard is structural here — this accessor cannot return a cross-tenant
 * parent. Discriminated result preserves the route's 404 (missing) vs
 * 403 (mismatch) distinction byte-for-byte; the mismatch warn-log moves
 * here because only this accessor holds both company ids.
 */
export async function parentEventAuthLookup(
  parentEventId: string,
  authorizedCompanyId: string,
  log: Logger,
): Promise<ParentEventAuthResult> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('shift_events')
    .select('id, company_id')
    .eq('id', parentEventId)
    .single();
  if (error || !data) return { event: null, crossTenant: false };
  const row = data as { id: string; company_id: string };
  if (row.company_id !== authorizedCompanyId) {
    log.warn(
      {
        parentEventId: row.id,
        parentCompany: row.company_id,
        shiftCompany: authorizedCompanyId,
      },
      'correction.tenant_mismatch',
    );
    return { event: null, crossTenant: true };
  }
  return { event: row, crossTenant: false };
}

/** approve lock-miss refetch — unscoped post-auth read, relocated verbatim. */
export function refetchShiftStatus(shiftId: string) {
  const db = getServiceClient();
  return db.from('shifts').select('id, status').eq('id', shiftId).maybeSingle();
}

/** Worker chain tail (adjust/dispute/correct variant) — relocated verbatim.
 *  Deliberately worker-scoped only: runs after authorization, keyed on the
 *  authorized shift's worker. Do not add a company predicate (slice rule). */
export function workerChainTail(workerId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

/** approve's v0 chain tail — relocated verbatim incl. the CRACK 219
 *  two-column order (created_at DESC, id DESC tiebreak). */
export function workerV0ChainTail(workerId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', workerId)
    .eq('spec_version', '0')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** approve's pre-CRACK-218 legacy-final detection — relocated verbatim
 *  (event-type + JSON-field scoped; flow control on authorized data). */
export function legacyFinalApprovalQuery(shiftId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('id, event_hash, event_data')
    .eq('event_type', 'SUPERVISOR_APPROVAL')
    .filter('event_data->>shift_id', 'eq', shiftId)
    .filter('event_data->>layer', 'eq', 'FINAL')
    .order('created_at', { ascending: false })
    .limit(1);
}

/** Mutation-route factories: post-membership re-reads + writes. */
export function shiftsMutationRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // Post-membership re-reads (per-route column lists per spec).
    getForAdjust: (shiftId: string) =>
      db
        .from('shifts')
        .select('id, worker_id, site_id, receipt_id, start_time, end_time, break_minutes, total_hours, status')
        .eq('id', shiftId)
        .eq('company_id', companyId)
        .single(),
    getForApprove: (shiftId: string) =>
      db
        .from('shifts')
        .select('id, worker_id, site_id, receipt_id, status, total_hours')
        .eq('id', shiftId)
        .eq('company_id', companyId)
        .single(),
    getForDispute: (shiftId: string) =>
      db
        .from('shifts')
        .select('id, worker_id, site_id, receipt_id, status')
        .eq('id', shiftId)
        .eq('company_id', companyId)
        .single(),
    getForCorrect: (shiftId: string) =>
      db
        .from('shifts')
        .select('id, worker_id, site_id, receipt_id')
        .eq('id', shiftId)
        .eq('company_id', companyId)
        .single(),

    // adjust's UPDATE — relocated verbatim: .eq('id') ONLY. Adding a
    // company predicate is the W2/SG-1 hardening item, not this slice.
    updateAfterAdjust: (shiftId: string, fields: Record<string, unknown>) =>
      db.from('shifts').update(fields).eq('id', shiftId),

    // dispute's UPDATE — relocated verbatim: .eq('id') ONLY (same note).
    updateToDisputed: (shiftId: string, nowIso: string) =>
      db.from('shifts').update({ status: 'DISPUTED', updated_at: nowIso }).eq('id', shiftId),

    // approve's optimistic-lock UPDATE — relocated verbatim:
    // .eq('id').eq('status') EXACTLY (no company predicate; same note).
    approveOptimistic: (shiftId: string, fields: Record<string, unknown>) =>
      db
        .from('shifts')
        .update(fields)
        .eq('id', shiftId)
        .eq('status', 'SUPERVISOR_APPROVED')
        .select('id, status')
        .maybeSingle(),

    // command/export's per-shift UPDATE — relocated verbatim (W1.3):
    // .eq('id') ONLY. Company-predicate hardening is W2/SG-1, not this
    // slice.
    markExported: (shiftId: string, exportId: string, nowIso: string) =>
      db
        .from('shifts')
        .update({ status: 'EXPORTED', export_id: exportId, updated_at: nowIso })
        .eq('id', shiftId),

    // field/shift/start (W1.4) — shifts row creation; company_id from
    // the binding (the worker's own company row value).
    insertShiftStart: (row: Record<string, unknown>) =>
      db
        .from('shifts')
        .insert({ ...row, company_id: companyId })
        .select('id, receipt_id')
        .single(),

    // field/shift/end (W1.4) — ARCH-1/ARCH-2 optimistic transition,
    // relocated verbatim: .eq('id').eq('status','IN_PROGRESS') EXACTLY
    // (belt-and-braces concurrency guard; .single() as before).
    submitOptimistic: (shiftId: string, fields: Record<string, unknown>) =>
      db
        .from('shifts')
        .update(fields)
        .eq('id', shiftId)
        .eq('status', 'IN_PROGRESS')
        .select('id, status, end_time, total_hours')
        .single(),
  };
}

export function shiftEventsMutationRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // v0 event insert — company_id supplied by the factory binding, which
    // equals the authorized shift.company_id by construction (membership
    // was checked against it).
    insertV0Event: (row: Record<string, unknown>) =>
      db.from('shift_events').insert({ ...row, company_id: companyId }),

    // field/shift/start (W1.4) — START_EVENT insert returning the new
    // row id; company_id from the binding.
    insertV0EventReturningId: (row: Record<string, unknown>) =>
      db
        .from('shift_events')
        .insert({ ...row, company_id: companyId })
        .select('id')
        .single(),

    // correct's insert returns the new row's id + hash.
    insertCorrectionEvent: (row: Record<string, unknown>) =>
      db
        .from('shift_events')
        .insert({ ...row, company_id: companyId })
        .select('id, event_hash')
        .single(),

    // dispute's WLES v1 path (flag-gated OFF in prod) — pass-throughs so
    // the route never touches the raw client.
    v1ChainTail: () =>
      getV1ChainTail(db as unknown as Parameters<typeof getV1ChainTail>[0], companyId),
    insertV1: (
      sealed: Parameters<typeof insertV1Event>[1],
      opts: Parameters<typeof insertV1Event>[2],
    ) => insertV1Event(db as unknown as Parameters<typeof insertV1Event>[0], sealed, opts),
  };
}


// ────────────────────────────────────────────────────────────────────
// W1.3 (2026-06-10) — export-path accessors. Same discipline as above:
// pure indirection, query bytes identical to the previous inlines.
// ────────────────────────────────────────────────────────────────────

/** command/export per-shift chain tail — relocated verbatim incl. the
 *  CRACK 219 two-column order. Deliberately worker-scoped, mixed
 *  v0/v1 tail (no spec_version filter) and .single(): do not "fix"
 *  any of these (slice rule); RPC migration is tracked as CRACK 220. */
export function exportChainTail(workerId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .single();
}

/** Worker-self sealed-record chain (worker/records/export) — returns
 *  the base builder so the route keeps its conditional date bounds;
 *  query bytes identical. */
export function workerShiftEventsSelfRepo(workerId: string) {
  const db = getServiceClient();
  return {
    recordsChainQuery: () =>
      db
        .from('shift_events')
        .select('id, shift_id_from_event_data, event_type, event_data, event_hash, previous_event_hash, created_at, spec_version, wles_event')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: true }),
  };
}

/** field/receipt tamper-evidence lookups (W1.4) — relocated verbatim.
 *  Event-type + JSON-path keyed on a shift id taken from the worker's
 *  own receipt row (post-auth); company-predicate hardening is a
 *  W2/SG-1 candidate, not this slice. */
export function commitHashForShift(shiftId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('event_hash')
    .eq('event_type', 'SHIFT_COMMIT')
    .filter('event_data->>shift_id', 'eq', shiftId)
    .maybeSingle();
}

/** field/receipt intelligence-status lookup (W1.4) — two call sites
 *  shared this shape with different event_type literals; parameterised
 *  (slice-2a precedent), query bytes unchanged. */
export function intelligenceEventForShift(eventType: string, shiftId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('id')
    .eq('event_type', eventType)
    .filter('event_data->>shift_id', 'eq', shiftId)
    .maybeSingle();
}

/** worker/disputes shift-site lookup (W1.4) — relocated verbatim.
 *  Unscoped fetch by a client-supplied shift id, consuming only
 *  site_id (company_id selected-but-unused, as before). Pre-existing
 *  behaviour preserved; tenant-predicate hardening is a named W2/SG-1
 *  correctness candidate, not a silent fix in this slice. */
export function disputeShiftLookup(shiftId: string) {
  const db = getServiceClient();
  return db.from('shifts').select('site_id, company_id').eq('id', shiftId).maybeSingle();
}

/** worker/disputes chain anchor (W1.4) — relocated verbatim
 *  (id + event_hash, latest event for the worker, maybeSingle). */
export function disputeChainTail(workerId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('id, event_hash')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

/** worker/disputes WORKER_DISPUTE_FILED insert (W1.4) — returns the
 *  new event id. companyId comes from the verified worker identity and
 *  MAY be null; it is written as-is, exactly as the route previously
 *  inlined (the company-bound factory takes string-only by design). */
export function insertWorkerDisputeEvent(
  companyId: string | null,
  row: Record<string, unknown>,
) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .insert({ ...row, company_id: companyId })
    .select('id')
    .single();
}

/** field/shift/end shift lookup (W1.4) — fetch-then-authorize analog
 *  relocated verbatim: fetched unscoped by the client-supplied shift id;
 *  the route's cross-worker guard (shift.worker_id !== sessionWorkerId →
 *  403) MUST run before anything trusts this row. Guard test pins the
 *  ordering. */
export function endShiftLookup(shiftId: string) {
  const db = getServiceClient();
  return db
    .from('shifts')
    .select('id, worker_id, site_id, company_id, start_time, end_time, status, receipt_id')
    .eq('id', shiftId)
    .single();
}

/** field/shift/start sync-conflict guard (W1.4) — pass-through so the
 *  route never holds the raw client; sync-guard's queries unchanged. */
export function runDuplicateStartGuard(workerId: string, shiftDate: string) {
  const db = getServiceClient();
  return checkDuplicateStartEvent(
    db as unknown as Parameters<typeof checkDuplicateStartEvent>[0],
    workerId,
    shiftDate,
  );
}

/** field/shift/start retry-storm replay lookups (W1.4) — relocated
 *  verbatim from the tryRetryReplay helper. */
export function startEventReplayLookup(workerId: string, clientEventId: string) {
  const db = getServiceClient();
  return db
    .from('shift_events')
    .select('id, created_at')
    .eq('worker_id', workerId)
    .filter('event_data->>client_event_id', 'eq', clientEventId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

export function firstShiftForDate(workerId: string, shiftDate: string) {
  const db = getServiceClient();
  return db
    .from('shifts')
    .select('id, receipt_id, start_time')
    .eq('worker_id', workerId)
    .eq('shift_date', shiftDate)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}

/** field/shift start+end geofence-coordinate lookup (W1.4) — relocated
 *  verbatim (identical shape at both call sites). Id-keyed post-auth
 *  (site id from the request/shift after the worker guard); W2/SG-1
 *  hardening candidate. */
export function siteGeofenceCheckById(siteId: string) {
  const db = getServiceClient();
  return db
    .from('sites')
    .select('id, lat, lng, geofence_radius_metres')
    .eq('id', siteId)
    .maybeSingle();
}

/** Side-pipe emitter wrappers (W1.4): the emit helpers take a service
 *  client in their options; these inject it at the repo layer so route
 *  handlers never hold the raw client. Fire-and-forget semantics and
 *  payloads unchanged. */
export function emitAuthEventWithServiceClient(
  log: Parameters<typeof emitAuthEvent>[0],
  opts: Omit<Parameters<typeof emitAuthEvent>[1], 'supabase'>,
) {
  const db = getServiceClient();
  return emitAuthEvent(log, {
    ...opts,
    supabase: db,
  } as unknown as Parameters<typeof emitAuthEvent>[1]);
}

export function emitGeofenceEventWithServiceClient(
  log: Parameters<typeof emitGeofenceEvent>[0],
  opts: Omit<Parameters<typeof emitGeofenceEvent>[1], 'supabase'>,
) {
  const db = getServiceClient();
  return emitGeofenceEvent(log, {
    ...opts,
    supabase: db,
  } as unknown as Parameters<typeof emitGeofenceEvent>[1]);
}
