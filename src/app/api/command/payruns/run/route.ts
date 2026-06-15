// Run-when-safe — assemble and keep a pay run from the window's approved
// shifts. POST /api/command/payruns/run
//
// TWO GATES, in order:
//   1) Readiness — the safe state machine (chain green, nothing waiting,
//      >=1 approved). Not READY -> 409 with the state + reason.
//   2) Enablement — `payrunRunEnabled()` (env PAYRUN_RUN_ENABLED). OFF
//      everywhere until go-live, so a READY run returns 423 Locked and
//      moves NOTHING. Only an explicitly enabled environment executes the
//      atomic export (which transitions shifts and writes WLES events).
//
// The execution path reuses the same `process_flostruction_export` RPC as
// the bookkeeper export, so a run produces a kept run identical to a
// manual export — downloadable via the ④ payroll/evidence routes.

import { NextResponse } from 'next/server';
import {
  pageRepo,
  payRunsRepo,
  anchorVerification,
  latestHealthChecks,
} from '@/lib/db/repositories/page.repo';
import { exportsRepo } from '@/lib/db/repositories/exports.repo';
import { deriveChainState, type AnchorRow, type HealthRow, type ShiftRow } from '@/lib/page/today-data';
import { computeRunReadiness, payrunRunEnabled } from '@/lib/payruns/run-readiness';
import { derivePayrollCsv, sha256Hex, type RunShiftRow } from '@/lib/payruns/run-detail';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';

function dateOnlyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

interface ProcessRow {
  export_id: string;
  exported_shifts?: string[];
  event_count?: number;
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

  // ── Gate 2: enablement (off until go-live) ─────────────────────────
  if (!payrunRunEnabled()) {
    log.info({ companyId, approved: approvedIds.length }, 'payruns.run.ready_but_locked');
    return NextResponse.json(
      {
        ok: false,
        state: 'READY',
        locked: true,
        reason: 'Running turns on at go-live. The run is ready and safe.',
      },
      { status: 423 },
    );
  }

  // ── Execute: derive the file, then the atomic export RPC ───────────
  const { data: shiftRows } = await payRunsRepo(companyId).shiftsByIds(approvedIds);
  const csv = derivePayrollCsv((shiftRows ?? []) as unknown as RunShiftRow[]);
  const fileHash = sha256Hex(csv);

  const { data: rpcData, error } = await exportsRepo(companyId).processFlostructionExport({
    adminUserId: userId,
    shiftIds: approvedIds,
    fileHash,
  });
  if (error) {
    log.error({ err: error.message }, 'payruns.run.export_failed');
    return NextResponse.json({ ok: false, error: 'Run failed to assemble' }, { status: 500 });
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as ProcessRow | undefined;
  const exportId = row?.export_id ?? null;

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'export',
    resourceId: exportId ?? 'unknown',
    action: 'export',
    reasonCode: 'payrun_run_when_safe',
    request,
  });

  return NextResponse.json(
    { ok: true, exportId, shiftCount: approvedIds.length },
    { status: 200 },
  );
}
