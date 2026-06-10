// Flostruction — Sites repository (W1.4, 2026-06-10)
//
// Company scope bound at the factory; query shapes byte-identical to
// the previous command/sites inlines. Insert payload keeps its route
// literal with company_id supplied by the binding (slice-2b precedent).

import { getServiceClient } from '@/lib/db/service-client';

/** Company-scoped sites access for command routes. */
export function sitesRepo(companyId: string) {
  const db = getServiceClient();
  return {
    // command/sites GET — relocated verbatim.
    list: () =>
      db
        .from('sites')
        .select('id, name, address, site_code, geofence_radius_metres, is_active, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),

    // command/sites POST — insert relocated verbatim; company_id from
    // the binding.
    create: (row: Record<string, unknown>) =>
      db
        .from('sites')
        .insert({ ...row, company_id: companyId })
        .select('id, name, site_code')
        .single(),
  };
}
