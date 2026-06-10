// Flostruction Field — Home Data Route
// GET /api/field/home-data
//
// Returns everything /field/home needs to render its three-state
// panel (B1): worker identity, active shift (if any), primary site,
// this-week verified hours, and a first-login flag.
//
// Day 5 P1.3 — GAP-A3-002 closure. worker derived from session.
// Day 6 redesign (2026-04-22) — extended for B1 state-driven UI.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): worker-self repositories replace the raw client.
import { workerSelfRepo } from '@/lib/db/repositories/workers.repo';
import { workerShiftsSelfRepo } from '@/lib/db/repositories/shifts.repo';
import { siteGeoById } from '@/lib/db/repositories/sites.repo';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

interface ShiftRow {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  site_id: string | null;
  anomaly_flags: unknown;
}

interface SiteRow {
  id: string;
  name: string;
  address: string | null;
  geofence_lat: string | null;
  geofence_lng: string | null;
  geofence_radius_metres: number | null;
}

function weekStartAEST(date: Date): string {
  // Monday-based ISO week; AEST for stable day-boundary handling.
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/field/home-data', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let workerId: string;
  try {
    ({ workerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const selfRepo = workerSelfRepo(workerId);
  const selfShifts = workerShiftsSelfRepo(workerId);

  // Worker + primary site
  const { data: worker, error: workerErr } = await selfRepo.getHomeProfile();

  if (workerErr || !worker) {
    log.error({ err: workerErr?.message, workerId }, 'home_data.worker_not_found');
    return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
  }

  // Primary site — assigned via workers.primary_site_id (if present)
  // or derived from the most recent site_id on the worker's shifts.
  // Falls back to null if the worker has never had a site.
  let primarySite: SiteRow | null = null;

  const { data: workerSiteLink } = await selfRepo.getPrimarySiteId();

  const primarySiteId =
    (workerSiteLink as { primary_site_id?: string | null } | null)?.primary_site_id ?? null;

  if (primarySiteId) {
    const { data: site } = await siteGeoById(primarySiteId);
    if (site) primarySite = site as SiteRow;
  } else {
    // Fallback: most-recent shift's site.
    const { data: recent } = await selfShifts.lastSiteId();
    if (recent?.site_id) {
      const { data: site } = await siteGeoById(recent.site_id);
      if (site) primarySite = site as SiteRow;
    }
  }

  // Active shift — status = IN_PROGRESS for this worker. There should
  // only ever be one by virtue of the sync-guard + CHECK logic, but
  // defensively we order by start_time DESC and take the first.
  const { data: activeRows } = await selfShifts.inProgress();

  const activeShift = (activeRows as ShiftRow[] | null)?.[0] ?? null;

  // This week's shifts (Mon–Sun). Used for week-hours tally AND the
  // "This Week's Shifts" read-only list on the home screen.
  const thisWeekStart = weekStartAEST(new Date());
  const { data: weekShifts } = await selfShifts.listWeekWithAnomalies(thisWeekStart);

  const shifts = (weekShifts as ShiftRow[] | null) ?? [];

  // Verified hours this week = sum of total_hours across APPROVED states.
  // Status bar: IN_PROGRESS (excluded), SUBMITTED (excluded, not yet
  // verified), SUPERVISOR_APPROVED + PAYROLL_APPROVED + EXPORTED
  // (included as verified).
  const verifiedStatuses = new Set([
    'SUPERVISOR_APPROVED',
    'PAYROLL_APPROVED',
    'EXPORTED',
  ]);
  const verifiedHoursThisWeek = shifts.reduce((acc, s) => {
    if (verifiedStatuses.has(s.status) && s.total_hours) {
      return acc + parseFloat(s.total_hours);
    }
    return acc;
  }, 0);

  // First-login flag (Q4 answer: derive from shift history, no schema
  // change). hasAnyShiftsEver = does this worker have any shift row at
  // all, regardless of status. If false and no active shift, show
  // onboarding panel.
  const { count: totalShiftCount } = await selfShifts.countAll();

  const hasAnyShiftsEver = (totalShiftCount ?? 0) > 0;

  return NextResponse.json({
    worker: {
      id: worker.id,
      first_name: worker.first_name,
      last_name: worker.last_name,
      employee_id: worker.employee_id,
      company_id: worker.company_id,
    },
    primary_site: primarySite
      ? {
          id: primarySite.id,
          name: primarySite.name,
          address: primarySite.address,
          geofence_lat: primarySite.geofence_lat ? Number(primarySite.geofence_lat) : null,
          geofence_lng: primarySite.geofence_lng ? Number(primarySite.geofence_lng) : null,
          geofence_radius_metres: primarySite.geofence_radius_metres ?? null,
        }
      : null,
    active_shift: activeShift,
    week: {
      start: thisWeekStart,
      shifts,
      verified_hours: Math.round(verifiedHoursThisWeek * 100) / 100,
    },
    first_login: !hasAnyShiftsEver && !activeShift,
  });
}
