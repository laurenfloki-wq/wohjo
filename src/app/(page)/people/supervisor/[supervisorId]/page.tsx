// Supervisor profile — open, amend, deactivate. Same detail + amendment
// pattern as the worker profile.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { supervisorsRepo } from '@/lib/db/repositories/supervisors.repo';
import { sinceLabel } from '@/lib/page/people-data';
import { listAdminActionsForResource } from '@/lib/audit/admin-access-log';
import { sydneyDateLabel, sydneyTime } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import SupervisorEdit from './SupervisorEdit';

export const dynamic = 'force-dynamic';

interface SupRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function SupervisorProfilePage({
  params,
}: {
  params: Promise<{ supervisorId: string }>;
}) {
  const log = routeLogger('GET /people/supervisor/:id', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'supervisor.detail.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">A supervisor’s record needs a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const { supervisorId } = await params;
  const repo = supervisorsRepo(companyId);
  const { data } = await repo.getById(supervisorId);
  if (!data) {
    return (
      <main>
        <div className="greet">
          <div className="day">People</div>
          <h1>That supervisor isn’t on your record.</h1>
          <p className="sub">
            It may have been removed, or the link is from another company.{' '}
            <Link href="/people">Back to People</Link>.
          </p>
        </div>
      </main>
    );
  }
  const s = data as SupRow;
  const history = await listAdminActionsForResource('supervisor', supervisorId, companyId, 50);

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <Link href="/people" className="backlink">
        ← People
      </Link>
      <div className="greet">
        <div className="day">
          <Link href="/people">People</Link> · supervisor
        </div>
        <h1>{s.name ?? 'Unnamed'}</h1>
        <p className="sub">
          Approves shifts by SMS · on record since {sinceLabel(s.created_at)}
          {s.is_active ? '' : ' · inactive'}.
        </p>
      </div>

      <SupervisorEdit
        supervisor={{
          id: s.id,
          name: s.name ?? '',
          phone: s.phone,
          email: s.email,
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
          <div className="allclear">
            No changes recorded yet. Every amendment writes a line here.
          </div>
        ) : null}
      </section>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
