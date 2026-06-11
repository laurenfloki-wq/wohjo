// Flostruction — Sign-in identity repository (W1.4, 2026-06-10)
//
// Identity-derivation surface for the /field sign-in flow
// (role-detect + bootstrap-worker). Every lookup is keyed on the
// VERIFIED session user's id/phone — the session IS the scope; the
// rows returned can only be the caller's own identity records.
// Query shapes relocated verbatim.

import { getServiceClient } from '@/lib/db/service-client';

/** role-detect step 1 — already-linked worker. */
export function activeWorkerByUserId(userId: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
}

/** role-detect step 2 — first-time worker (user_id not yet linked). */
export function activeWorkerByPhone(phone: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();
}

/** role-detect step 3 — admin signing in via the field OTP page. */
export function adminByUserId(userId: string) {
  const db = getServiceClient();
  return db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
}

/** bootstrap-worker phone lookup — relocated verbatim (CRACK 164:
 *  includes company_id for the auth-claim propagation). */
export function bootstrapWorkerByPhone(phone: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id, user_id, is_active, phone, company_id')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle();
}

/** bootstrap-worker link — race-guarded UPDATE relocated verbatim:
 *  .is('user_id', null) so two simultaneous bootstraps can't race. */
export function linkWorkerToUser(workerId: string, userId: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .update({ user_id: userId })
    .eq('id', workerId)
    .is('user_id', null)
    .select('id, user_id')
    .single();
}

/** CRACK 164 claim propagation — auth.admin surface reached via the
 *  chokepoint; the route keeps its fail-soft try/catch + logging. */
export function setCompanyClaimOnAuthUser(userId: string, companyId: string) {
  const db = getServiceClient();
  return db.auth.admin.updateUserById(userId, {
    app_metadata: { company_id: companyId },
  });
}

/** L2.1 sign-in observation profile — relocated verbatim. */
export function workerSignInProfile(workerId: string) {
  const db = getServiceClient();
  return db
    .from('workers')
    .select('id, company_id, first_name')
    .eq('id', workerId)
    .maybeSingle();
}
