// Run-when-safe — assemble and keep a pay run from the window's approved
// shifts. POST /api/command/payruns/run
//
// TWO GATES, in order:
//   1) Readiness — the safe state machine (chain green, nothing waiting,
//      >=1 approved). Not READY -> 409 with the state + reason.
//   2) Enablement — `payrunRunEnabled()` (env PAYRUN_RUN_ENABLED). LIVE by
//      default now the export is built; a READY run executes unless the kill
//      switch PAYRUN_RUN_ENABLED='false' is set, in which case it returns
//      423 Locked and moves NOTHING.
//
// Execution goes through assemblePayrollExport: it formats the approved
// shifts (Employment Hero), creates the exports row, seals a WLES
// EXPORT_RECORD per shift in TS (v1 sealEvent; v0 fallback), and marks each
// shift EXPORTED — a kept run downloadable via the payroll/evidence routes.

import { NextResponse } from 'next/server';
import { pageRepo, anchorVerification, latestHealthChecks } from '@/lib/db/repositories/page.repo';
import {
  deriveChainState,
  type AnchorRow,
  type HealthRow,
  type ShiftRow,
} from '@/lib/page/today-data';
import { computeRunReadiness, payrunRunEnabled } from '@/lib/payruns/run-readiness';
import { getApprovedShifts } from '@/lib/export/get-approved-shifts';
import { assemblePayrollExport } from '@/lib/payruns/assemble-export';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/payruns/run', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // ── Gate 1: readiness ──────────────────────────────────────────────
  const page = pageRepo(companyId);
  const [windowRes, anchorsRes, healthRes] = await Promise.all([
    page.shiftsBetween(dateOnlyDaysAgo(6), dateOnlyDaysAgo(0)),
    anchorVerification(),
    latestHealthChecks(),
  ]);
  const windowShifts = (windowRes.data ?? []) as ShiftRow[];
  const chain = deriveChainState(
    (anchorsRes.data ?? []) as AnchorRow[],
    (healthRes.data ?? []) as HealthRow[],
  );
  const approvedIds = windowShifts.filter((s) => s.status === 'PAYROLL_APPROVED').map((s) => s.id);
  const waitingCount = windowShifts.filter((s) => s.status === 'SUBMITTED').length;

  const readiness = computeRunReadiness({
    chainBroken: chain.broken,
    waitingCount,
    approvedCount: approvedIds.length,
  });

  if (!readiness.canRun) {
    return NextResponse.json(
      { ok: false, state: readiness.state, reason: readiness.reason, canRun: false },
      { status: 409 },
    );
  }

  // ── Gate 2: kill switch (only when PAYRUN_RUN_ENABLED='false') ──────
  if (!payrunRunEnabled()) {
    log.info({ companyId, approved: approvedIds.length }, 'payruns.run.ready_but_locked');
    return NextResponse.json(
      {
        ok: false,
        state: 'READY',
        locked: true,
        reason: 'Running is paused for this environment. The run is ready and safe.',
      },
      { status: 423 },
    );
  }

  // ── Execute: assemble the real, WLES-v1-sealed pay-run export ──────
  // Employment Hero is the validated, registered formatter; MYOB stays on
  // the /command surface until its formatter is implemented + registered.
  // The same window as the readiness gate; getApprovedShifts re-reads the
  // PAYROLL_APPROVED set the gate counted.
  const payPeriodStart = dateOnlyDaysAgo(6);
  const payPeriodEnd = dateOnlyDaysAgo(0);
  const shifts = await getApprovedShifts({ companyId, payPeriodStart, payPeriodEnd });

  const assembled = await assemblePayrollExport({
    companyId,
    adminUserId: userId,
    providerId: 'employment_hero',
    payPeriodStart,
    payPeriodEnd,
    shifts,
  });

  if (!assembled.ok) {
    log.error({ status: assembled.status, error: assembled.error }, 'payruns.run.export_failed');
    return NextResponse.json(
      { ok: false, error: assembled.error, details: assembled.details },
      { status: assembled.status },
    );
  }

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'export',
    resourceId: assembled.exportId,
    action: 'export',
    reasonCode: 'payrun_run_when_safe',
    request,
  });

  return NextResponse.json(
    { ok: true, exportId: assembled.exportId, shiftCount: assembled.shiftCount },
    { status: 200 },
  );
}
