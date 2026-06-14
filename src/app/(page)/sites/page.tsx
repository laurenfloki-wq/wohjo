// Sites — live. A day-line per site from today's shifts; first site
// kept forever. "Sites end. Their records don't."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { pageRepo, sitesPageRepo } from '@/lib/db/repositories/page.repo';
import { sydneyDateKey, sydneyTime, type ShiftRow } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import OpenASite from './OpenASite';

export const dynamic = 'force-dynamic';

interface SiteRow {
  id: string;
  name: string | null;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number | null;
  is_active: boolean | null;
  created_at: string;
}

const SEALED = new Set(['SUBMITTED', 'APPROVED', 'EXPORTED']);

export default async function SitesPage() {
  const log = routeLogger('GET /sites', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'sites.auth_failed');
    } else {
      log.error({ err }, 'sites.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          Sites are composed from your company&rsquo;s records and need a signed-in operator.
        </p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">Sign in</a>
        </div>
      </main>
    );
  }

  const repo = sitesPageRepo(companyId);
  const page = pageRepo(companyId);
  const todayKey = sydneyDateKey(new Date().toISOString());
  const [sitesRes, shiftsRes] = await Promise.all([
    repo.listSites(),
    page.shiftsBetween(todayKey, todayKey),
  ]);
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const todayShifts = (shiftsRes.data ?? []) as ShiftRow[];
  const bySite = new Map<string, ShiftRow[]>();
  for (const s of todayShifts) {
    if (s.site_id === null) continue;
    const list = bySite.get(s.site_id) ?? [];
    list.push(s);
    bySite.set(s.site_id, list);
  }

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">Sites</div>
        <h1>Sites end. Their records don&rsquo;t.</h1>
        <p className="sub">
          A day-line per site — each dot is an arrival backed by the record. Presence is evidence,
          not surveillance: workers see everything you see.
        </p>
      </div>

      <section className="sect" aria-label="Sites today">
        <h2 className="label">Today · green sealed · amber still recording</h2>
        {sites.map((site, i) => {
          const shifts = (bySite.get(site.id) ?? []).sort((a, b) =>
            (a.start_time ?? '').localeCompare(b.start_time ?? ''),
          );
          const onSite = shifts.length;
          return (
            <div className="site-row" key={site.id}>
              <span className="n">{site.name ?? 'Unnamed site'}</span>
              <span className="s">
                {i === 0 ? 'first site · kept forever' : (site.address ?? '')}
                {site.is_active === false ? ' · closed' : ''}
              </span>
              <span className="dayline" aria-label={`Arrivals at ${site.name ?? 'site'}`}>
                {shifts.map((s) => (
                  <span
                    key={s.id}
                    className={`dot${s.status === 'IN_PROGRESS' ? ' live' : ''}`}
                    title={s.start_time !== null ? sydneyTime(s.start_time) : ''}
                    aria-label={`arrival${s.start_time !== null ? ` ${sydneyTime(s.start_time)}` : ''} — ${SEALED.has(s.status) ? 'sealed' : 'recording'}`}
                  />
                ))}
              </span>
              <span className="hrs mono">
                {onSite === 0 ? 'quiet today' : `${onSite} today`}
              </span>
              <span
                className={
                  shifts.some((s) => s.status === 'IN_PROGRESS') ? 'state live' : onSite > 0 ? 'state sealed' : 'state pend'
                }
              >
                {shifts.some((s) => s.status === 'IN_PROGRESS')
                  ? 'recording'
                  : onSite > 0
                    ? 'sealed'
                    : 'quiet'}
              </span>
            </div>
          );
        })}
        {sites.length === 0 ? (
          <div className="allclear">No sites yet. Open the first below.</div>
        ) : null}
        <OpenASite />
      </section>

      <div className="archive">
        <div className="line">The first site is kept forever. So is its first page.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
