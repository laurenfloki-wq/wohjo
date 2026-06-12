// Today — the daily page. The system reads the data so the operator
// doesn't. Server component: every number on this page is a live row.
// Directors-approved prototype is the pixel reference (12 June 2026).

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import {
  anchorVerification,
  latestHealthChecks,
  pageRepo,
} from '@/lib/db/repositories/page.repo';
import {
  renderChainFailureSentence,
  renderHandledSentences,
  type SentenceEventRow,
} from '@/lib/page/sentences';
import {
  archiveDayCount,
  deriveChainState,
  deriveGreeting,
  deriveWeekReading,
  sydneyDateKey,
  sydneyDateLabel,
  sydneyTime,
  sydneyWeekday,
  type AnchorRow,
  type HealthRow,
  type ShiftRow,
} from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import DecisionRow from './DecisionRow';
import LiveTimer from './LiveTimer';

export const dynamic = 'force-dynamic';

interface NameRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString();
}

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default async function TodayPage() {
  const log = routeLogger('GET /today', null);

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'today.auth_failed');
    } else {
      log.error({ err }, 'today.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          Today&rsquo;s page is composed from your company&rsquo;s sealed records and needs a
          signed-in operator. <a href="/command">Go to sign in</a>.
        </p>
      </main>
    );
  }

  const repo = pageRepo(companyId);
  const now = new Date();
  const [
    eventsRes,
    eventDaysRes,
    weekRes,
    prevWeekRes,
    openRes,
    exportRes,
    anchorsRes,
    healthRes,
  ] = await Promise.all([
    repo.eventsSince(isoDaysAgo(2)),
    repo.eventDays(),
    repo.shiftsBetween(dateOnlyDaysAgo(6), dateOnlyDaysAgo(0)),
    repo.shiftsBetween(dateOnlyDaysAgo(13), dateOnlyDaysAgo(7)),
    repo.openAndPending(),
    repo.latestExport(),
    anchorVerification(),
    latestHealthChecks(),
  ]);

  const events = (eventsRes.data ?? []) as SentenceEventRow[];
  const eventDays = (eventDaysRes.data ?? []) as Array<{ created_at: string }>;
  const weekShifts = (weekRes.data ?? []) as ShiftRow[];
  const prevWeekShifts = (prevWeekRes.data ?? []) as ShiftRow[];
  const openShifts = (openRes.data ?? []) as ShiftRow[];
  const anchors = (anchorsRes.data ?? []) as AnchorRow[];
  const health = (healthRes.data ?? []) as HealthRow[];
  const latestExport = exportRes.data as {
    exported_at: string | null;
    pay_period_end: string | null;
    total_hours: number | string | null;
    total_shifts: number | null;
  } | null;

  const chain = deriveChainState(anchors, health);
  const week = deriveWeekReading(weekShifts, prevWeekShifts);
  const pending = openShifts.filter((s) => s.status === 'SUBMITTED');
  const inProgress = openShifts.filter((s) => s.status === 'IN_PROGRESS');
  const greeting = deriveGreeting({ now, chain, waitingCount: pending.length, week });

  // Display names for sentences and rows.
  const workerIds = [
    ...new Set(
      [...events, ...openShifts, ...weekShifts]
        .map((r) => r.worker_id)
        .filter((v): v is string => v !== null),
    ),
  ];
  const siteIds = [
    ...new Set(
      [...events, ...openShifts, ...weekShifts]
        .map((r) => r.site_id)
        .filter((v): v is string => v !== null),
    ),
  ];
  const [workersRes, sitesRes] = await Promise.all([
    workerIds.length > 0 ? repo.workerNames(workerIds) : Promise.resolve({ data: [] }),
    siteIds.length > 0 ? repo.siteNames(siteIds) : Promise.resolve({ data: [] }),
  ]);
  const workerNames: Record<string, string> = {};
  for (const w of (workersRes.data ?? []) as NameRow[]) {
    workerNames[w.id] = [w.first_name, w.last_name].filter(Boolean).join(' ');
  }
  const siteNames: Record<string, string> = {};
  for (const s of (sitesRes.data ?? []) as NameRow[]) {
    if (typeof s.name === 'string') siteNames[s.id] = s.name;
  }

  const handled = renderHandledSentences(events, { workerNames, siteNames });
  const failureSentence = chain.broken
    ? renderChainFailureSentence({
        mismatchCount: Math.max(chain.extraMismatchCount, 1),
        cleanCount: chain.cleanCount,
      })
    : null;

  const archiveCount = archiveDayCount(eventDays.map((d) => d.created_at));
  const todayKey = sydneyDateKey(now.toISOString());
  const todaySealed = weekShifts.filter(
    (s) =>
      s.shift_date === todayKey && (s.status === 'APPROVED' || s.status === 'EXPORTED'),
  );

  // Pay run thread proportions — live counts, no invented widths.
  const totalForThread = week.sealedCount + week.inMotionCount + week.waitingCount;
  const pctA = totalForThread > 0 ? Math.round((week.sealedCount / totalForThread) * 100) : 0;
  const pctB = totalForThread > 0 ? Math.round((week.inMotionCount / totalForThread) * 100) : 0;

  const provenance =
    chain.sweepAt !== null
      ? `prepared ${sydneyTime(chain.sweepAt)} · ${chain.expectedCount} hashes checked`
      : 'first verification sweep pending — the page reads live rows until it lands';

  const superDue =
    latestExport?.exported_at != null
      ? sydneyDateLabel(new Date(new Date(latestExport.exported_at).getTime() + 7 * 86400000))
      : null;

  return (
    <main className={chain.broken ? 'broken' : ''}>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
        <span className="chaintext mono">{chain.chainText}</span>
        <span className="mono">{sydneyDateLabel(now)}</span>
      </div>

      <div className="greet">
        <div className="day">{sydneyWeekday(now)}&rsquo;s page</div>
        <h1 aria-live="polite" aria-atomic="true">
          {greeting.before}
          <span className={greeting.emphasisTone === 'alarm' ? 'alarmword' : 'safeword'}>
            {greeting.emphasis}
          </span>
          {greeting.after}
        </h1>
        <p className="sub" aria-live="polite" aria-atomic="true">
          {greeting.sub}
        </p>
        <div className="prov">{provenance}</div>
      </div>

      <section className="payrun" aria-label="Pay run">
        <div className="head">
          <span className="t">
            {latestExport?.pay_period_end != null
              ? `Pay run · period ended ${sydneyDateLabel(new Date(latestExport.pay_period_end))}`
              : 'Pay run · assembling from this week’s sealed records'}
          </span>
          <span className="when">Payday Super · 7-day window</span>
        </div>
        <div className="thread" role="img" aria-label="Pay run progress">
          <span className="a" style={{ width: `${pctA}%` }} />
          <span className="b" style={{ width: `${pctB}%` }} />
        </div>
        <div className="marks" aria-hidden="true">
          <span className="mk">
            <i />
            <b>today · {sydneyDateLabel(now)}</b>
          </span>
          {latestExport?.exported_at != null ? (
            <span className="mk mid">
              <i />
              <b>last run · {sydneyDateLabel(new Date(latestExport.exported_at))}</b>
            </span>
          ) : null}
          {superDue !== null ? (
            <span className="mk right">
              <i />
              <b>super window closes · {superDue}</b>
            </span>
          ) : null}
        </div>
        <div className="reading">
          <p aria-live="polite" aria-atomic="true">
            <span className="n g">{week.sealedCount}</span> records sealed and verified ·{' '}
            <span className="n m">{week.inMotionCount}</span> still in motion on site ·{' '}
            <span className="n">{pending.length}</span> waiting on you below.
          </p>
          <button
            type="button"
            className={`runbtn${chain.broken ? ' blocked' : ''}`}
            disabled
            title={
              chain.broken
                ? 'Held — review the failed record first'
                : 'Running arrives with Pay runs — Phase 2'
            }
          >
            {chain.broken ? 'Held — review the record first' : 'Run when safe'}
          </button>
        </div>
      </section>

      <section className="sect" aria-label="With you">
        <h2 className="label">
          With you · {pending.length === 0 ? 'clear' : pending.length}
        </h2>
        {pending.map((s) => {
          const worker = (s.worker_id !== null && workerNames[s.worker_id]) || 'A worker';
          const site = (s.site_id !== null && siteNames[s.site_id]) || 'site';
          const started = s.start_time !== null ? sydneyTime(s.start_time) : '';
          return (
            <DecisionRow
              key={s.id}
              shiftId={s.id}
              sentence={`${worker}’s ${started} shift at ${site} is committed and needs your approval.`}
              meta={`${site}${s.receipt_id !== null ? ` · ${s.receipt_id}` : ''}`}
            />
          );
        })}
        {pending.length === 0 ? (
          <div className="allclear">
            Nothing is with you. The page will stay quiet until something is.
          </div>
        ) : null}
      </section>

      <section className="sect" aria-label="Handled">
        <h2 className="label">Handled</h2>
        {failureSentence !== null ? (
          <div className="h-row alarm">
            <span className="tick" />
            <p>
              <b>{failureSentence.lead}</b>
              {failureSentence.rest}
            </p>
            <span className="ref">{failureSentence.refText}</span>
          </div>
        ) : null}
        {handled.map((s, i) => (
          <div className="h-row" key={i}>
            <span className="tick" />
            <p>
              <b>{s.lead}</b>
              {s.rest}
            </p>
            <span className="ref">{s.refText}</span>
          </div>
        ))}
        {handled.length === 0 && failureSentence === null ? (
          <div className="allclear">Nothing happened overnight. That is the whole report.</div>
        ) : null}
      </section>

      <section className="sect" aria-label="On site now">
        <h2 className="label">
          On site now · {inProgress.length} recording
        </h2>
        {inProgress.map((s) => (
          <div className="site-row" key={s.id}>
            <span className="n">
              {(s.worker_id !== null && workerNames[s.worker_id]) || 'A worker'}
            </span>
            <span className="s">
              {(s.site_id !== null && siteNames[s.site_id]) || ''}
            </span>
            <span className="hrs mono">
              {s.start_time !== null ? <LiveTimer startIso={s.start_time} /> : '—'}
            </span>
            <span className="state live">recording</span>
          </div>
        ))}
        {todaySealed.map((s) => (
          <div className="site-row" key={s.id}>
            <span className="n">
              {(s.worker_id !== null && workerNames[s.worker_id]) || 'A worker'}
            </span>
            <span className="s">
              {(s.site_id !== null && siteNames[s.site_id]) || ''}
              {s.receipt_id !== null ? ` · ${s.receipt_id}` : ''}
            </span>
            <span className="hrs mono">
              {s.total_hours !== null ? Number(s.total_hours).toFixed(2) : '—'}
            </span>
            <span className="state sealed">sealed</span>
          </div>
        ))}
        {inProgress.length === 0 && todaySealed.length === 0 ? (
          <div className="allclear">No one is on site right now.</div>
        ) : null}
      </section>

      <div className="archive">
        <div className="line">
          Every day writes a page. Pages are kept — yours now number {archiveCount}.
        </div>
      </div>

      <div className="pagefoot">
        <span>
          <span className="mono">{week.sealedCount + week.waitingCount}</span> records this week ·{' '}
          <b>{chain.broken ? `${chain.cleanCount}/${chain.expectedCount} hashes verified · evidence held` : 'all hashes verified'}</b>
        </span>
        <span>tamper-evident · red appears on this page only if a hash breaks</span>
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
