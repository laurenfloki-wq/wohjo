// Today — the daily page. The system reads the data so the operator
// doesn't. Server component: composes a TodayModel from live rows and
// renders TodayView. The /today/demo route renders the same view from
// the synthetic demo canon.

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { anchorVerification, latestHealthChecks, pageRepo } from '@/lib/db/repositories/page.repo';
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
  sydneyShortDate,
  sydneyTime,
  sydneyWeekday,
  type AnchorRow,
  type HealthRow,
  type ShiftRow,
} from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import type { PayRunMark, TodayModel, TodaySiteRow } from '@/lib/page/today-model';
import TodayView from './TodayView';

export const dynamic = 'force-dynamic';

interface NameRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
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
          signed-in operator.
        </p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
          <a className="signin-demo" href="/today/demo">
            or read the demo page
          </a>
        </div>
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
    directorSitesRes,
  ] = await Promise.all([
    repo.eventsSince(isoDaysAgo(2)),
    repo.eventDays(),
    repo.shiftsBetween(dateOnlyDaysAgo(6), dateOnlyDaysAgo(0)),
    repo.shiftsBetween(dateOnlyDaysAgo(13), dateOnlyDaysAgo(7)),
    repo.openAndPending(),
    repo.latestExport(),
    anchorVerification(),
    latestHealthChecks(),
    repo.directorSites(),
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
  // Director-actionable: supervisor-approved shifts awaiting payroll approval.
  // SUBMITTED shifts are normally awaiting the supervisor, not the director —
  // they must not offer a payroll-approve button that 409s.
  const readyForPayroll = openShifts.filter((s) => s.status === 'SUPERVISOR_APPROVED');
  // EXCEPT on "supervisor = director" sites: there a SUBMITTED shift IS the
  // director's to act on — one tap seals both gates (the approve route runs
  // the combined path). Surface those so the same-person workflow can
  // actually complete from the dashboard.
  const directorSiteIds = new Set(
    ((directorSitesRes.data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const combinedReady = pending.filter((s) => s.site_id !== null && directorSiteIds.has(s.site_id));
  const actionableCount = readyForPayroll.length + combinedReady.length;
  const greeting = deriveGreeting({ now, chain, waitingCount: actionableCount, week });

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
  const workerName = (id: string | null): string => (id !== null && workerNames[id]) || 'A worker';
  const siteName = (id: string | null): string => (id !== null && siteNames[id]) || '';

  const handled = renderHandledSentences(events, { workerNames, siteNames });
  const failure = chain.broken
    ? renderChainFailureSentence({
        mismatchCount: Math.max(chain.extraMismatchCount, 1),
        cleanCount: chain.cleanCount,
      })
    : null;

  const todayKey = sydneyDateKey(now.toISOString());
  const todaySealed = weekShifts.filter(
    (s) => s.shift_date === todayKey && (s.status === 'APPROVED' || s.status === 'EXPORTED'),
  );

  const totalForThread = week.sealedCount + week.inMotionCount + week.waitingCount;
  const pctA = totalForThread > 0 ? Math.round((week.sealedCount / totalForThread) * 100) : 0;
  const pctB = totalForThread > 0 ? Math.round((week.inMotionCount / totalForThread) * 100) : 0;

  const marks: PayRunMark[] = [{ pos: 'left', text: `today · ${sydneyShortDate(now)}` }];
  if (latestExport !== null && latestExport.exported_at !== null) {
    marks.push({
      pos: 'mid',
      text: `last run · ${sydneyShortDate(new Date(latestExport.exported_at))}`,
    });
    marks.push({
      pos: 'right',
      text: `super closes · ${sydneyShortDate(
        new Date(new Date(latestExport.exported_at).getTime() + 7 * 86400000),
      )}`,
    });
  }

  const onsite: TodaySiteRow[] = [
    ...inProgress.map(
      (s): TodaySiteRow => ({
        key: s.id,
        name: workerName(s.worker_id),
        site: siteName(s.site_id),
        hours: null,
        startIso: s.start_time,
        state: 'recording',
      }),
    ),
    ...todaySealed.map(
      (s): TodaySiteRow => ({
        key: s.id,
        name: workerName(s.worker_id),
        site: `${siteName(s.site_id)}${s.receipt_id !== null ? ` · ${s.receipt_id}` : ''}`,
        hours: s.total_hours !== null ? Number(s.total_hours).toFixed(2) : null,
        startIso: null,
        state: 'sealed',
      }),
    ),
  ];

  const model: TodayModel = {
    demo: false,
    broken: chain.broken,
    chainText: chain.chainText,
    dateLabel: sydneyDateLabel(now),
    dayLabel: `${sydneyWeekday(now)}’s page`,
    greeting,
    provenance:
      chain.sweepAt !== null
        ? `prepared ${sydneyTime(chain.sweepAt)} · ${chain.expectedCount} hashes checked`
        : 'first verification sweep pending — the page reads live rows until it lands',
    payrun: {
      title:
        latestExport !== null && latestExport.pay_period_end !== null
          ? `Pay run · period ended ${sydneyDateLabel(new Date(latestExport.pay_period_end))}`
          : 'Pay run · assembling from this week’s sealed records',
      sealed: week.sealedCount,
      inMotion: week.inMotionCount,
      waiting: actionableCount,
      pctA,
      pctB,
      marks,
      runLabel: chain.broken ? 'Held — review the record first' : 'Run when safe',
      runBlocked: chain.broken,
    },
    decisions: [
      ...readyForPayroll.map((s) => ({
        shiftId: s.id,
        sentence: `${workerName(s.worker_id)}’s ${
          s.start_time !== null ? sydneyTime(s.start_time) : ''
        } shift at ${siteName(s.site_id) || 'site'} is supervisor-approved and ready for your payroll approval.`,
        meta: `${siteName(s.site_id) || 'site'}${s.receipt_id !== null ? ` · ${s.receipt_id}` : ''}`,
      })),
      ...combinedReady.map((s) => ({
        shiftId: s.id,
        sentence: `${workerName(s.worker_id)}’s ${
          s.start_time !== null ? sydneyTime(s.start_time) : ''
        } shift at ${siteName(s.site_id) || 'site'} is ready for your approval — you’re both supervisor and director here, so one tap seals both gates.`,
        meta: `${siteName(s.site_id) || 'site'}${s.receipt_id !== null ? ` · ${s.receipt_id}` : ''}`,
      })),
    ],
    handled,
    failure,
    onsite,
    archiveCount: archiveDayCount(eventDays.map((d) => d.created_at)),
    weekRecords: week.sealedCount + week.waitingCount,
    footState: chain.broken
      ? `${chain.cleanCount}/${chain.expectedCount} hashes verified · evidence held`
      : 'all hashes verified',
    brand: brandLine(),
  };

  return <TodayView model={model} />;
}
