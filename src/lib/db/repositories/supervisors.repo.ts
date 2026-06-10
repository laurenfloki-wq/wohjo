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
 *  Deliberately id-keyed only: runs post-auth on ids harvested from the
 *  company-scoped shifts read, so the rows can only belong to the
 *  session tenant. Adding a company predicate is a W2/SG-1 hardening
 *  candidate, not this slice (verbatim rule). */
export function supervisorNamesByIds(ids: string[]) {
  const db = getServiceClient();
  return db.from('supervisors').select('id, name, phone').in('id', ids);
}
