// Company profile read/write — the genuine company-level settings surface.
// Company-scoped by construction: every query is bound to the companyId given
// at construction, so a forged id can never reach another tenant's row.

import { getServiceClient } from '@/lib/db/service-client';

const COMPANY_COLUMNS = 'id, name, abn, abn_digits, contact_email, contact_phone';

export function companyRepo(companyId: string) {
  const db = getServiceClient();
  return {
    get: () =>
      db.from('companies').select(COMPANY_COLUMNS).eq('id', companyId).maybeSingle(),

    updateFields: (patch: Record<string, unknown>) =>
      db
        .from('companies')
        .update(patch)
        .eq('id', companyId)
        .select(COMPANY_COLUMNS)
        .single(),
  };
}
