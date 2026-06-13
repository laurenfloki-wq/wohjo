// People — live. Three doors; lifetime verified hours as the
// relationship number. "A worker's record belongs to the work, not to
// the argument."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { peopleRepo } from '@/lib/db/repositories/page.repo';
import { formatHours, lifetimeHoursByWorker, sinceLabel, type ShiftHoursRow } from '@/lib/page/people-data';
import { brandLine } from '@/lib/page/flags';
import AddSomeone from './AddSomeone';

export const dynamic = 'force-dynamic';

interface WorkerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  is_active: boolean | null;
}

interface SupervisorRow {
  id: string;
  name: string | null;
  phone: string | null;
  is_active: boolean | null;
  created_at: string;
  pending_sms_approval_ids: string[] | null;
  last_batch_sms_sent_at: string | null;
}

export default async function PeoplePage() {
  const log = routeLogger('GET /people', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'people.auth_failed');
    } else {
      log.error({ err }, 'people.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          People is composed from your company&rsquo;s records and needs a signed-in operator.{' '}
          <a href="/command">Go to sign in</a>.
        </p>
      </main>
    );
  }

  const repo = peopleRepo(companyId);
  const [workersRes, hoursRes, supervisorsRes] = await Promise.all([
    repo.listWorkers(),
    repo.allShiftHours(),
    repo.listSupervisors(),
  ]);
  const workers = (workersRes.data ?? []) as WorkerRow[];
  const hours = lifetimeHoursByWorker((hoursRes.data ?? []) as ShiftHoursRow[]);
  const supervisors = (supervisorsRes.data ?? []) as SupervisorRow[];

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">People</div>
        <h1>A worker&rsquo;s record belongs to the work, not to the argument.</h1>
        <p className="sub">
          Lifetime verified hours are the relationship number — they follow the worker, sealed,
          wherever the work goes.
        </p>
      </div>

      <section className="sect" aria-label="Add someone">
        <h2 className="label">Three doors</h2>
        <div className="doors">
          <div className="door">
            <div className="t">Found for you</div>
            <p>
              Arrives when your payroll roster is connected — names in your pay items that
              aren&rsquo;t on Flostruction yet, one SMS each. Adding someone takes thirty seconds
              meanwhile.
            </p>
          </div>
          <div className="door">
            <div className="t">Supervising</div>
            <p>
              {supervisors.length === 0
                ? 'No supervisors yet — add one and they approve by SMS from that minute.'
                : `${supervisors.length} ${supervisors.length === 1 ? 'supervisor approves' : 'supervisors approve'} shifts by SMS. Their pending queue is below.`}
            </p>
          </div>
          <div className="door">
            <div className="t">The record</div>
            <p>
              Every person added here starts a sealed record. Workers see everything you see —
              presence is evidence, not surveillance.
            </p>
          </div>
        </div>
        <AddSomeone />
      </section>

      <section className="sect" aria-label="Workers">
        <h2 className="label">Workers · {workers.length}</h2>
        {workers.map((w) => {
          const name = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'Unnamed';
          const h = hours[w.id];
          return (
            <div className="site-row" key={w.id}>
              <span className="n">{name}</span>
              <span className="s">
                since {sinceLabel(w.created_at)}
                {w.is_active === false ? ' · inactive' : ''}
              </span>
              <span className="hrs mono">
                {h !== undefined ? `${formatHours(h)} verified hours` : 'no sealed hours yet'}
              </span>
              <span className={h !== undefined ? 'state sealed' : 'state pend'}>
                {h !== undefined ? 'sealed record' : 'record open'}
              </span>
            </div>
          );
        })}
        {workers.length === 0 ? (
          <div className="allclear">
            No workers yet. Add the first above — their record starts the moment you do.
          </div>
        ) : null}
      </section>

      <section className="sect" aria-label="Supervising">
        <h2 className="label">Supervising · {supervisors.length}</h2>
        {supervisors.map((s) => {
          const pending = s.pending_sms_approval_ids?.length ?? 0;
          return (
            <div className="site-row" key={s.id}>
              <span className="n">{s.name ?? 'Unnamed'}</span>
              <span className="s">
                approves by SMS · since {sinceLabel(s.created_at)}
                {s.is_active === false ? ' · inactive' : ''}
              </span>
              <span className="hrs mono">
                {pending === 0 ? 'queue clear' : `${pending} awaiting reply`}
              </span>
              <span className={pending === 0 ? 'state sealed' : 'state live'}>
                {pending === 0 ? 'clear' : 'asked'}
              </span>
            </div>
          );
        })}
        {supervisors.length === 0 ? (
          <div className="allclear">No supervisors yet.</div>
        ) : null}
      </section>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
