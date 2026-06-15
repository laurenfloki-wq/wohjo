// Flostruction — Supervisors repository (W1.4, 2026-06-10)
//
// Company scope bound at the factory; query shapes byte-identical to
// the previous route inlines. The command/supervisors route.test.ts
// schema-drift guard pins the SELECT clause HERE (it followed the
// relocation — S9).

import { getServiceClient } from '@/lib/db/service-client';

/** Company-scoped supervisors access for command routes. */
export function supervisorsRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // command/supervisors GET — SELECT + order relocated verbatim
    // (Stage 2 canonical pattern: created_at in SELECT, newest first;
    // updated_at still absent from production).
    list: () =>
      db
        .from('supervisors')
        .select('id, name, phone, email, is_active, verify_token, site_ids, supabase_user_id, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),

    // command/supervisors POST duplicate check — relocated verbatim.
    findIdByPhone: (phone: string) =>
      db
        .from('supervisors')
        .select('id')
        .eq('phone', phone)
        .eq('company_id', companyId)
        .maybeSingle(),

    getById: (id: string) =>
      db
        .from('supervisors')
        .select('id, name, phone, email, is_active, created_at')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),

    updateFields: (id: string, patch: Record<string, unknown>) =>
      db
        .from('supervisors')
        .update(patch)
        .eq('id', id)
        .eq('company_id', companyId)
        .select('id, name, phone, email, is_active')
        .single(),

    // command/supervisors POST insert — company_id from the binding.
    create: (row: Record<string, unknown>) =>
      db
        .from('supervisors')
        .insert({ ...row, company_id: companyId })
        .select('id, name, phone, verify_token')
        .single(),
  };
}

/** command/approvals supervisor-name lookup — relocated verbatim.
 *  Id-keyed by DECISION (assessed W2.2, 2026-06-11): ids are harvested
 *  from the company-scoped shifts read and the projection is
 *  display-only (name, phone) — no pay or tenant data. */
export function supervisorNamesByIds(ids: string[]) {
  const db = getServiceClient();
  return db.from('supervisors').select('id, name, phone').in('id', ids);
}

/** verify/approve pending-SMS cleanup — W2/SG-1 hardening LANDED
 *  (2026-06-11): the write is tenant-scoped; supervisorId still comes
 *  from the token-matched row (token-anchored auth ran first). */
export function clearPendingSmsApproval(
  supervisorId: string,
  companyId: string,
  remaining: string[],
) {
  const db = getServiceClient();
  return db
    .from('supervisors')
    .update({ pending_sms_approval_ids: remaining })
    .eq('id', supervisorId)
    .eq('company_id', companyId);
}
