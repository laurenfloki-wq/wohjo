// Worker profile — open, amend, deactivate. The reusable detail +
// amendment pattern: an editable operational panel over an immutable
// history. Sealed labour hours are read-only by nature.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { workersRepo } from '@/lib/db/repositories/workers.repo';
import { peopleRepo } from '@/lib/db/repositories/page.repo';
import {
  formatHours,
  lifetimeHoursByWorker,
  sinceLabel,
  type ShiftHoursRow,
} from '@/lib/page/people-data';
import { listAdminActionsForResource } from '@/lib/audit/admin-access-log';
import { sydneyDateLabel, sydneyTime } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import WorkerEdit from './WorkerEdit';

export const dynamic = 'force-dynamic';

interface WorkerRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  employee_id: string;
  pay_rate: string;
  award_classification: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function WorkerProfilePage({
  params,
}: {
  params: Promise<{ workerId: string }>;
}) {
  const log = routeLogger('GET /people/:id', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'people.detail.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">A worker’s record needs a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">Sign in</a>
        </div>
      </main>
    );
  }

  const { workerId } = await params;
  const repo = workersRepo(companyId);
  const { data } = await repo.getById(workerId);
  if (!data) {
    return (
      <main>
        <div className="greet">
          <div className="day">People</div>
          <h1>That worker isn’t on your record.</h1>
          <p className="sub">
            It may have been removed, or the link is from another company.{' '}
            <Link href="/people">Back to People</Link>.
          </p>
        </div>
      </main>
    );
  }
  const w = data as WorkerRow;
  const name = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'Unnamed';

  const [hoursRes, history] = await Promise.all([
    peopleRepo(companyId).allShiftHours(),
    listAdminActionsForResource('worker', workerId, companyId, 50),
  ]);
  const hrs = lifetimeHoursByWorker((hoursRes.data ?? []) as ShiftHoursRow[])[workerId];

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">
          <Link href="/people">People</Link> · profile
        </div>
        <h1>{name}</h1>
        <p className="sub">
          {hrs !== undefined
            ? `${formatHours(hrs)} lifetime verified hours · `
            : 'No sealed hours yet · '}
          on record since {sinceLabel(w.created_at)}
          {w.is_active ? '' : ' · inactive'}.
        </p>
      </div>

      <WorkerEdit
        worker={{
          id: w.id,
          first_name: w.first_name,
          last_name: w.last_name,
          phone: w.phone,
          email: w.email,
          employee_id: w.employee_id,
          pay_rate: Number(w.pay_rate).toFixed(2),
          award_classification: w.award_classification,
          is_active: w.is_active,
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
