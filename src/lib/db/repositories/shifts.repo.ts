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
