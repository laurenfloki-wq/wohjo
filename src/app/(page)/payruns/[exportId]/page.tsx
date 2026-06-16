// Pay-run detail — a kept run is a door. Period, totals, the payroll file
// and the Evidence Pack (both downloadable), the shift-by-shift breakdown,
// the pack state explained, and the immutable access history. Read-only by
// nature: a sealed run is evidence, never edited.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { payRunsRepo } from '@/lib/db/repositories/page.repo';
import { listAdminActionsForResource } from '@/lib/audit/admin-access-log';
import { packState } from '@/lib/payruns/run-detail';
import { sydneyDateLabel, sydneyShortDate, sydneyTime } from '@/lib/page/today-data';
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
  file_hash: string | null;
  shift_ids: string[] | null;
}

interface PackRow {
  export_id: string;
  pack_fingerprint: string | null;
  generated_at: string | null;
}

interface ShiftRow {
  id: string;
  shift_date: string;
  total_hours: number | string | null;
  receipt_id: string;
  workers: { first_name: string; last_name: string } | null;
  sites: { name: string } | null;
}

function periodLabel(e: ExportRow): string {
  if (e.pay_period_start !== null && e.pay_period_end !== null) {
    return e.pay_period_start === e.pay_period_end
      ? sydneyDateLabel(new Date(e.pay_period_end))
      : `${sydneyShortDate(new Date(e.pay_period_start))} – ${sydneyShortDate(new Date(e.pay_period_end))}`;
  }
  return e.exported_at !== null ? sydneyDateLabel(new Date(e.exported_at)) : 'Undated run';
}

export default async function PayRunDetailPage({
  params,
}: {
  params: Promise<{ exportId: string }>;
}) {
  const log = routeLogger('GET /payruns/:id', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'payruns.detail.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          A pay run is composed from sealed records and needs a signed-in operator.
        </p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const { exportId } = await params;
  const repo = payRunsRepo(companyId);
  const { data } = await repo.getExportById(exportId);
  if (!data) {
    return (
      <main>
        <div className="greet">
          <div className="day">
            <Link href="/payruns">Pay runs</Link> · run
          </div>
          <h1>That run isn’t on your record.</h1>
          <p className="sub">
            It may be from another company, or the link is stale.{' '}
            <Link href="/payruns">Back to Pay runs</Link>.
          </p>
        </div>
      </main>
    );
  }
  const e = data as unknown as ExportRow;
  const ids = e.shift_ids ?? [];

  const [packsRes, shiftsRes, history] = await Promise.all([
    repo.packsByExportIds([exportId]),
    ids.length > 0 ? repo.shiftsByIds(ids) : Promise.resolve({ data: [] as ShiftRow[] }),
    listAdminActionsForResource('export', exportId, companyId, 50),
  ]);
  const pack = ((packsRes.data ?? []) as unknown as PackRow[])[0] ?? null;
  const shifts = (shiftsRes.data ?? []) as unknown as ShiftRow[];
  const ps = packState(pack?.pack_fingerprint ?? null);

  const hours = e.total_hours !== null ? Number(e.total_hours).toFixed(2) : '0.00';
  const shiftCount = e.total_shifts ?? shifts.length;

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <Link href="/payruns" className="backlink">
        ← Pay runs
      </Link>
      <div className="greet">
        <div className="day">
          <Link href="/payruns">Pay runs</Link> · run
        </div>
        <h1>{periodLabel(e)}</h1>
        <p className="sub">
          {hours} verified hours · {shiftCount} {shiftCount === 1 ? 'shift' : 'shifts'} ·{' '}
          {e.export_target ?? 'payroll'} export. The payroll file and the Evidence Pack carry the
          same mathematics.
        </p>
      </div>

      <div className="run-actions">
        <a className="btn amber" href={`/api/command/payruns/${exportId}/payroll`}>
          Download payroll file
        </a>
        <a className="btn quiet" href={`/api/command/payruns/${exportId}/evidence`}>
          Download Evidence Pack
        </a>
      </div>

      <p className={ps.ready ? 'run-note' : 'run-note gen'}>
        {ps.ready ? (
          <>
            {ps.label}. <span className="fp">{ps.short}</span>
            {e.file_hash !== null ? (
              <>
                {' '}
                · payroll fingerprint <span className="fp">{e.file_hash.slice(0, 10)}…</span>
              </>
            ) : null}
          </>
        ) : (
          <>
            {ps.label} — the run is kept and its records are sealed; the pack fingerprint finishes
            shortly. Both files above are available now.
          </>
        )}
      </p>

      <div className="run-meta">
        <div className="cell">
          <span className="k">Kept</span>
          <span className="v">
            {e.exported_at !== null ? sydneyDateLabel(new Date(e.exported_at)) : '—'}
          </span>
        </div>
        <div className="cell">
          <span className="k">Hours</span>
          <span className="v">{hours}</span>
        </div>
        <div className="cell">
          <span className="k">Shifts</span>
          <span className="v">{shiftCount}</span>
        </div>
      </div>

      <section className="sect" aria-label="Shifts in this run">
        <h2 className="label">Shifts · {shifts.length}</h2>
        {shifts.map((s) => {
          const name =
            [s.workers?.first_name, s.workers?.last_name].filter(Boolean).join(' ') || 'Worker';
          const h = s.total_hours !== null ? Number(s.total_hours).toFixed(2) : '0.00';
          return (
            <div className="h-row" key={s.id}>
              <span className="tick" />
              <p>
                <b>{name}</b> — {h} hours · {sydneyShortDate(new Date(s.shift_date))}
                {s.sites?.name ? ` · ${s.sites.name}` : ''}
              </p>
              <span className="ref">{s.receipt_id}</span>
            </div>
          );
        })}
        {shifts.length === 0 ? (
          <div className="allclear">
            No shift rows resolve for this run — the file downloads carry its sealed records.
          </div>
        ) : null}
      </section>

      <section className="sect" aria-label="Access history">
        <h2 className="label">Access · {history.length}</h2>
        {history.map((h) => (
          <div className="h-row" key={h.id}>
            <span className="tick" />
            <p>
              <b>{h.action.toLowerCase()}</b>
              {h.reason_code !== null ? ` — ${h.reason_code.replace(/_/g, ' ')}` : ''} ·{' '}
              {sydneyDateLabel(new Date(h.at))} {sydneyTime(h.at)}
            </p>
            <span className="ref">operator</span>
          </div>
        ))}
        {history.length === 0 ? (
          <div className="allclear">
            No downloads yet. Every export of this run writes a line here.
          </div>
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
