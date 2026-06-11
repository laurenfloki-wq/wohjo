// Flostruction — WOHJO Verify repository (W1.4, 2026-06-10)
//
// Supervisor token surface. The verify_token lookup IS the
// authentication (token-anchored auth, Day-7 P0 patches): the row can
// only be the token holder's own, and supervisor_id/site_ids are
// derived from the matched row — never from client input. Each route's
// column list is relocated verbatim (four distinct shapes kept
// distinct). Everything below the token lookups is post-token reads on
// ids derived from verified rows.

import { getServiceClient } from '@/lib/db/service-client';

/** verify/auth — relocated verbatim (.single()). */
export function supervisorAuthByToken(token: string) {
  const db = getServiceClient();
  return db
    .from('supervisors')
    .select('id, company_id, name, phone, site_ids, is_active, verify_token')
    .eq('verify_token', token)
    .eq('is_active', true)
    .single();
}

/** verify/shifts — relocated verbatim (.maybeSingle()). */
export function supervisorForShiftList(token: string) {
  const db = getServiceClient();
  return db
    .from('supervisors')
    .select('id, site_ids, is_active')
    .eq('verify_token', token)
    .eq('is_active', true)
    .maybeSingle();
}

/** verify/approve — relocated verbatim (incl. pending_sms_approval_ids). */
export function supervisorForApprove(token: string) {
  const db = getServiceClient();
  return db
    .from('supervisors')
    .select('id, company_id, name, phone, site_ids, is_active, pending_sms_approval_ids')
    .eq('verify_token', token)
    .eq('is_active', true)
    .maybeSingle();
}

/** verify/dispute — relocated verbatim. */
export function supervisorForDispute(token: string) {
  const db = getServiceClient();
  return db
    .from('supervisors')
    .select('id, company_id, name, phone, site_ids, is_active')
    .eq('verify_token', token)
    .eq('is_active', true)
    .maybeSingle();
}

/** verify/shifts list — scoped to the token-matched supervisor's
 *  site_ids; relocated verbatim. */
export function shiftsForSites(siteIds: string[], status: string) {
  const db = getServiceClient();
  return db
    .from('shifts')
    .select(`
      id, company_id, worker_id, site_id, shift_date, start_time, end_time,
      break_minutes, total_hours, receipt_id, status, confidence_score,
      anomaly_flags, worker_note, supervisor_approved_by, supervisor_approved_at,
      created_at, updated_at,
      workers(id, first_name, last_name, pay_rate),
      sites(id, name)
    `)
    .in('site_id', siteIds)
    .eq('status', status)
    .order('shift_date', { ascending: false });
}

/** verify/approve + verify/dispute shift fetch — fetch-then-authorize
 *  analog relocated verbatim: unscoped by the client-supplied shift id;
 *  the site-access guard (supervisor.site_ids must include
 *  shift.site_id → 403) MUST follow before anything trusts this row.
 *  Guard test pins the ordering. */
export function verifyShiftLookup(shiftId: string) {
  const db = getServiceClient();
  return db
    .from('shifts')
    .select('id, company_id, worker_id, site_id, shift_date, total_hours, receipt_id, status')
    .eq('id', shiftId)
    .single();
}

/** Post-guard display reads — ids from the verified shift row;
 *  relocated verbatim (W2/SG-1 hardening candidates, not this slice). */
export function workerNameById(workerId: string) {
  const db = getServiceClient();
  return db.from('workers').select('first_name, last_name').eq('id', workerId).single();
}

export function siteNameById(siteId: string) {
  const db = getServiceClient();
  return db.from('sites').select('name').eq('id', siteId).single();
}

export function companyContactEmail(companyId: string) {
  const db = getServiceClient();
  return db.from('companies').select('contact_email').eq('id', companyId).single();
}
