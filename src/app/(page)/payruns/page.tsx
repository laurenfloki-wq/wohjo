// Pay runs — live. The assembling run + every kept run with its pack
// fingerprint. "A pay run is a pack you can prove."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import {
  pageRepo,
  payRunsRepo,
  anchorVerification,
  latestHealthChecks,
} from '@/lib/db/repositories/page.repo';
import {
  deriveWeekReading,
  deriveChainState,
  sydneyDateLabel,
  sydneyShortDate,
  type ShiftRow,
  type AnchorRow,
  type HealthRow,
} from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import Link from 'next/link';
import { packState } from '@/lib/payruns/run-detail';
import { payrunRunEnabled } from '@/lib/payruns/run-readiness';
import { bucketShifts, derivePayrunSituation } from '@/lib/payruns/pipeline';
import { isAgedShift } from '@/lib/payruns/run-selection';
import PayrunCta from '@/components/page/PayrunCta';
import RunManifest, { type ManifestItem } from '@/components/page/RunManifest';

export const dynamic = 'force-dynamic';

interface ExportRow {
  id: string;
  exported_at: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  total_hours: number | string | null;
  total_shifts: number | null;
  export_target: string | null;
  file_hash: string | null;
}

interface PackRow {
  export_id: string;
  pack_fingerprint: string | null;
  generated_at: string | null;
}

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
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
          operator.
        </p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const runs = payRunsRepo(companyId);
  const page = pageRepo(companyId);
  const [exportsRes, weekRes, prevWeekRes, openRes, anchorsRes, healthRes, directorSitesRes] =
    await Promise.all([
      runs.listExports(),
      page.shiftsBetween(dateOnlyDaysAgo(6), dateOnlyDaysAgo(0)),
      page.shiftsBetween(dateOnlyDaysAgo(13), dateOnlyDaysAgo(7)),
      page.openAndPending(),
      anchorVerification(),
      latestHealthChecks(),
      page.directorSites(),
    ]);
  const exports_ = (exportsRes.data ?? []) as ExportRow[];
  const week = deriveWeekReading(
    (weekRes.data ?? []) as ShiftRow[],
    (prevWeekRes.data ?? []) as ShiftRow[],
  );
  const openShifts = (openRes.data ?? []) as ShiftRow[];
  const waiting = openShifts.filter((s) => s.status === 'SUBMITTED').length;

  const chain = deriveChainState(
    (anchorsRes.data ?? []) as AnchorRow[],
    (healthRes.data ?? []) as HealthRow[],
  );

  // Same pay-run truth as /today and the server run gate.
  const directorSiteIds = new Set(
    ((directorSitesRes.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const buckets = bucketShifts(openShifts, directorSiteIds);
  const lastExport = exports_[0] ?? null;
  const lastRun =
    lastExport !== null
      ? {
          label:
            lastExport.pay_period_end !== null
              ? sydneyDateLabel(new Date(lastExport.pay_period_end))
              : lastExport.exported_at !== null
                ? sydneyDateLabel(new Date(lastExport.exported_at))
                : 'the last run',
          href: `/payruns/${lastExport.id}`,
        }
      : null;
  const situation = derivePayrunSituation({
    chainBroken: chain.broken,
    buckets,
    approvalsHref: '/today#with-you',
    heldHref: '/today#handled',
    lastRun,
  });
  const runEnabled = payrunRunEnabled();

  // The reviewable manifest — every approved shift about to be sealed, with
  // aged (approved-late) shifts flagged for an include/hold decision. "Aged"
  // means before the current week (older than the rolling 7-day boundary).
  const approvedShifts = openShifts.filter((s) => s.status === 'PAYROLL_APPROVED');
  const agedCutoff = dateOnlyDaysAgo(6);
  const approvedWorkerIds = [
    ...new Set(approvedShifts.map((s) => s.worker_id).filter((v): v is string => v !== null)),
  ];
  const namesRes =
    approvedWorkerIds.length > 0 ? await page.workerNames(approvedWorkerIds) : { data: [] };
  const nameById: Record<string, string> = {};
  for (const w of (namesRes.data ?? []) as Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
  }>) {
    nameById[w.id] = [w.first_name, w.last_name].filter(Boolean).join(' ') || 'A worker';
  }
  const manifestItems: ManifestItem[] = approvedShifts.map((s) => ({
    id: s.id,
    worker: (s.worker_id !== null && nameById[s.worker_id]) || 'A worker',
    date: s.shift_date ?? '',
    dateLabel: s.shift_date ? sydneyShortDate(new Date(s.shift_date)) : '—',
    hours: s.total_hours !== null ? Number(s.total_hours) : 0,
    aged: isAgedShift(s.shift_date, agedCutoff),
  }));

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
          Every run is assembled from sealed records, fingerprinted, and kept — the payroll file and
          the Evidence Pack carry the same mathematics.
        </p>
      </div>

      <section className="payrun" aria-label="Assembling pay run">
        <div className="head">
          <span className="t">
            {situation.state === 'READY'
              ? 'Ready to run · review and seal'
              : 'Assembling · from your sealed records'}
          </span>
          <span className="when">Payday Super · 7 business days</span>
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
        </div>
        {situation.state === 'READY' ? (
          <RunManifest items={manifestItems} runEnabled={runEnabled} />
        ) : (
          <PayrunCta situation={situation} />
        )}
      </section>

      <section className="sect" aria-label="Kept runs">
        <div className="sect-head">
          <h2 className="label">Kept runs · {exports_.length}</h2>
          <Link className="seclink" href="/payruns/verify">
            Verify a pack →
          </Link>
        </div>
        {exports_.map((e) => {
          const pack = packByExport.get(e.id);
          // Sealed-on-run: identify the pack by the export file_hash when no
          // (unused) export_packs row exists — a real run is "sealed", not
          // perpetually "generating".
          const ps = packState(pack?.pack_fingerprint ?? e.file_hash);
          const period =
            e.pay_period_start !== null && e.pay_period_end !== null
              ? e.pay_period_start === e.pay_period_end
                ? sydneyDateLabel(new Date(e.pay_period_end))
                : `${sydneyShortDate(new Date(e.pay_period_start))} – ${sydneyShortDate(new Date(e.pay_period_end))}`
              : e.exported_at !== null
                ? sydneyDateLabel(new Date(e.exported_at))
                : 'undated';
          return (
            <Link className="h-row" href={`/payruns/${e.id}`} key={e.id}>
              <span className="tick" />
              <p>
                <b>{period}</b> —{' '}
                {e.total_hours !== null ? Number(e.total_hours).toFixed(2) : '0.00'} verified hours
                · {e.total_shifts ?? 0} {e.total_shifts === 1 ? 'shift' : 'shifts'} ·{' '}
                {e.export_target ?? 'payroll'} export.
              </p>
              <span className={ps.ready ? 'ref' : 'ref gen'} title={ps.label}>
                {ps.short}
              </span>
            </Link>
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
