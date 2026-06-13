// Pay runs — live. The assembling run + every kept run with its pack
// fingerprint. "A pay run is a pack you can prove."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { pageRepo, payRunsRepo } from '@/lib/db/repositories/page.repo';
import { deriveWeekReading, sydneyDateLabel, sydneyShortDate, type ShiftRow } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';

export const dynamic = 'force-dynamic';

interface ExportRow {
  id: string;
  exported_at: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  total_hours: number | string | null;
  total_shifts: number | null;
  export_target: string | null;
}

interface PackRow {
  export_id: string;
  pack_fingerprint: string | null;
  generated_at: string | null;
}

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function shortFp(fp: string | null): string {
  if (fp === null || fp.length < 12) return 'pack pending';
  return `pack ${fp.slice(0, 6)}…${fp.slice(-4)}`;
}

export default async function PayRunsPage() {
  const log = routeLogger('GET /payruns', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'payruns.auth_failed');
    } else {
      log.error({ err }, 'payruns.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          Pay runs are composed from your company&rsquo;s sealed records and need a signed-in
          operator. <a href="/command">Go to sign in</a>.
        </p>
      </main>
    );
  }

  const runs = payRunsRepo(companyId);
  const page = pageRepo(companyId);
  const [exportsRes, weekRes, prevWeekRes, openRes] = await Promise.all([
    runs.listExports(),
    page.shiftsBetween(dateOnlyDaysAgo(6), dateOnlyDaysAgo(0)),
    page.shiftsBetween(dateOnlyDaysAgo(13), dateOnlyDaysAgo(7)),
    page.openAndPending(),
  ]);
  const exports_ = (exportsRes.data ?? []) as ExportRow[];
  const week = deriveWeekReading(
    (weekRes.data ?? []) as ShiftRow[],
    (prevWeekRes.data ?? []) as ShiftRow[],
  );
  const waiting = ((openRes.data ?? []) as ShiftRow[]).filter((s) => s.status === 'SUBMITTED').length;

  const packIds = exports_.map((e) => e.id);
  const packsRes = packIds.length > 0 ? await runs.packsByExportIds(packIds) : { data: [] };
  const packByExport = new Map<string, PackRow>();
  for (const p of (packsRes.data ?? []) as PackRow[]) packByExport.set(p.export_id, p);

  const totalForThread = week.sealedCount + week.inMotionCount + waiting;
  const pctA = totalForThread > 0 ? Math.round((week.sealedCount / totalForThread) * 100) : 0;
  const pctB = totalForThread > 0 ? Math.round((week.inMotionCount / totalForThread) * 100) : 0;

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">Pay runs</div>
        <h1>A pay run is a pack you can prove.</h1>
        <p className="sub">
          Every run is assembled from sealed records, fingerprinted, and kept — the payroll file
          and the Evidence Pack carry the same mathematics.
        </p>
      </div>

      <section className="payrun" aria-label="Assembling pay run">
        <div className="head">
          <span className="t">Assembling · from this week&rsquo;s sealed records</span>
          <span className="when">Payday Super · 7-day window</span>
        </div>
        <div className="thread" role="img" aria-label="Pay run progress">
          <span className="a" style={{ width: `${pctA}%` }} />
          <span className="b" style={{ width: `${pctB}%` }} />
        </div>
        <div className="reading">
          <p>
            <span className="n g">{week.sealedCount}</span>{' '}
            {week.sealedCount === 1 ? 'record' : 'records'} sealed and verified ·{' '}
            <span className="n m">{week.inMotionCount}</span> still in motion ·{' '}
            <span className="n">{waiting}</span> waiting on Today.
          </p>
          <button
            type="button"
            className="runbtn"
            disabled
            title="Running from this page arrives with the pay-run state machine"
          >
            Run when safe
          </button>
        </div>
      </section>

      <section className="sect" aria-label="Kept runs">
        <h2 className="label">Kept runs · {exports_.length}</h2>
        {exports_.map((e) => {
          const pack = packByExport.get(e.id);
          const period =
            e.pay_period_start !== null && e.pay_period_end !== null
              ? e.pay_period_start === e.pay_period_end
                ? sydneyDateLabel(new Date(e.pay_period_end))
                : `${sydneyShortDate(new Date(e.pay_period_start))} – ${sydneyShortDate(new Date(e.pay_period_end))}`
              : e.exported_at !== null
                ? sydneyDateLabel(new Date(e.exported_at))
                : 'undated';
          return (
            <div className="h-row" key={e.id}>
              <span className="tick" />
              <p>
                <b>{period}</b> — {e.total_hours !== null ? Number(e.total_hours).toFixed(2) : '0.00'}{' '}
                verified hours · {e.total_shifts ?? 0} {e.total_shifts === 1 ? 'shift' : 'shifts'} ·{' '}
                {e.export_target ?? 'payroll'} export.
              </p>
              <span className="ref">{shortFp(pack?.pack_fingerprint ?? null)}</span>
            </div>
          );
        })}
        {exports_.length === 0 ? (
          <div className="allclear">No runs kept yet. The first one writes itself from Today.</div>
        ) : null}
      </section>

      <div className="archive">
        <div className="line">A run you can prove is a run nobody argues with.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
