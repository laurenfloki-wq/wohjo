// Site profile — open, amend, close. Same detail + amendment pattern.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { sitesRepo } from '@/lib/db/repositories/sites.repo';
import { sinceLabel } from '@/lib/page/people-data';
import { listAdminActionsForResource } from '@/lib/audit/admin-access-log';
import { sydneyDateLabel, sydneyTime } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import SiteEdit from './SiteEdit';

export const dynamic = 'force-dynamic';

interface SiteRow {
  id: string;
  name: string | null;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number | null;
  is_active: boolean;
  created_at: string;
}

export default async function SiteProfilePage({ params }: { params: Promise<{ siteId: string }> }) {
  const log = routeLogger('GET /sites/:id', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'site.detail.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">A site’s record needs a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">Sign in</a>
        </div>
      </main>
    );
  }

  const { siteId } = await params;
  const repo = sitesRepo(companyId);
  const { data } = await repo.getById(siteId);
  if (!data) {
    return (
      <main>
        <div className="greet">
          <div className="day">Sites</div>
          <h1>That site isn’t on your record.</h1>
          <p className="sub">
            It may have been removed, or the link is from another company.{' '}
            <Link href="/sites">Back to Sites</Link>.
          </p>
        </div>
      </main>
    );
  }
  const s = data as SiteRow;
  const history = await listAdminActionsForResource('site', siteId, companyId, 50);

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">
          <Link href="/sites">Sites</Link> · profile
        </div>
        <h1>{s.name ?? 'Unnamed site'}</h1>
        <p className="sub">
          {s.address !== null && s.address.length > 0 ? `${s.address} · ` : ''}
          {s.geofence_radius_metres ?? 200} m geofence · on record since {sinceLabel(s.created_at)}
          {s.is_active ? '' : ' · closed'}.
        </p>
      </div>

      <SiteEdit
        site={{
          id: s.id,
          name: s.name ?? '',
          address: s.address,
          site_code: s.site_code,
          geofence_radius_metres: s.geofence_radius_metres,
          is_active: s.is_active,
        }}
      />

      <section className="sect" aria-label="History">
        <h2 className="label">History · {history.length}</h2>
        {history.map((h) => (
          <div className="h-row" key={h.id}>
            <span className="tick" />
            <p>
              <b>{h.action.toLowerCase()}</b>
              {h.reason_code !== null ? ` — ${h.reason_code}` : ''} ·{' '}
              {sydneyDateLabel(new Date(h.at))} {sydneyTime(h.at)}
            </p>
            <span className="ref">operator</span>
          </div>
        ))}
        {history.length === 0 ? (
          <div className="allclear">No changes recorded yet. Every amendment writes a line here.</div>
        ) : null}
      </section>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
