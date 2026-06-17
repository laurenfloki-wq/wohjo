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
    // command/sites GET — relocated verbatim, widened with geofence/lat-lng
    // for the redesigned sites map and the supervisor_is_director flag.
    list: () =>
      db
        .from('sites')
        .select(
          'id, name, address, site_code, geofence_radius_metres, geofence_lat, geofence_lng, lat, lng, is_active, supervisor_is_director, created_at',
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),

    getById: (id: string) =>
      db
        .from('sites')
        .select(
          'id, name, address, site_code, geofence_radius_metres, is_active, supervisor_is_director, created_at',
        )
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),

    updateFields: (id: string, patch: Record<string, unknown>) =>
      db
        .from('sites')
        .update(patch)
        .eq('id', id)
        .eq('company_id', companyId)
        .select(
          'id, name, address, site_code, geofence_radius_metres, is_active, supervisor_is_director',
        )
        .single(),

    // command/sites POST — insert relocated verbatim; company_id from
    // the binding.
    create: (row: Record<string, unknown>) =>
      db
        .from('sites')
        .insert({ ...row, company_id: companyId })
        .select('id, name, site_code, supervisor_is_director')
        .single(),
  };
}

/** field/home-data geofence lookup (W1.4) — relocated verbatim
 *  (identical shape at two call sites: primary_site_id link and the
 *  most-recent-shift fallback). Id-keyed by DECISION (assessed W2.2,
 *  2026-06-11): site id comes from the worker's own row/shift and the
 *  projection is display/geofence data only. */
export function siteGeoById(siteId: string) {
  const db = getServiceClient();
  return db
    .from('sites')
    .select('id, name, address, geofence_lat, geofence_lng, geofence_radius_metres')
    .eq('id', siteId)
    .maybeSingle();
}

/** field/receipt site block (W1.4) — relocated verbatim; same
 *  assessed-and-left decision as siteGeoById (W2.2). */
export function siteNameAddressById(siteId: string) {
  const db = getServiceClient();
  return db.from('sites').select('name, address').eq('id', siteId).maybeSingle();
}

/** field/records site-name resolution (W1.4) — relocated verbatim;
 *  ids harvested from the worker's own shift rows. */
export function siteNamesByIds(ids: string[]) {
  const db = getServiceClient();
  return db.from('sites').select('id, name').in('id', ids);
}
