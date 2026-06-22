// Run-when-safe — assemble and keep a pay run from EVERY approved shift.
// POST /api/command/payruns/run   body: { hold_shift_ids?: string[] }
//
// Payday Super completeness (2026-06-18): the run starts from every
// approved-not-exported shift (no date window — nothing is silently dropped)
// and removes only the shifts the operator deliberately holds. The pay
// period is derived from the actual included shift dates. Held shifts stay
// PAYROLL_APPROVED for a later run; what was included and held is recorded
// in the admin audit log.
//
// TWO GATES, in order:
//   1) Readiness — chain green (never run over a held record) and >=1 shift
//      to include. Shifts still awaiting approval do NOT block the run; they
//      simply aren't approved yet, so they're not in it. Not ready -> 409.
//   2) Enablement — `payrunRunEnabled()` (env PAYRUN_RUN_ENABLED). LIVE by
//      default; a ready run executes unless the kill switch
//      PAYRUN_RUN_ENABLED='false' is set, in which case it returns 423 and
//      moves NOTHING.
//
// Execution goes through assemblePayrollExport: it formats the included
// shifts (Employment Hero), creates the exports row, seals a WLES
// EXPORT_RECORD per shift in TS (v1 sealEvent; v0 fallback), and marks each
// included shift EXPORTED — a kept run downloadable via the payroll/evidence
// routes.

import { NextResponse } from 'next/server';
import { anchorVerification, latestHealthChecks } from '@/lib/db/repositories/page.repo';
import { deriveChainState, type AnchorRow, type HealthRow } from '@/lib/page/today-data';
import { payrunRunEnabled } from '@/lib/payruns/run-readiness';
import { selectRunShifts } from '@/lib/payruns/run-selection';
import { getAllApprovedShifts } from '@/lib/export/get-approved-shifts';
import { assemblePayrollExport } from '@/lib/payruns/assemble-export';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';
import { entitlementGuard } from '@/lib/billing/entitlement-guard';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/payruns/run', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // D1 — gate new billable activity. Downloading a kept run's payroll/evidence
  // (the sealed records) stays open via those routes (BILL-5 carve-out).
  const gate = await entitlementGuard(companyId);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { hold_shift_ids?: unknown };
  const holdShiftIds = Array.isArray(body.hold_shift_ids)
    ? body.hold_shift_ids.filter((v): v is string => typeof v === 'string')
    : [];

  // ── Gate 1: readiness ──────────────────────────────────────────────
  const [approved, anchorsRes, healthRes] = await Promise.all([
    getAllApprovedShifts(companyId),
    anchorVerification(),
    latestHealthChecks(),
  ]);
  const chain = deriveChainState(
    (anchorsRes.data ?? []) as AnchorRow[],
    (healthRes.data ?? []) as HealthRow[],
  );

  if (chain.broken) {
    return NextResponse.json(
      {
        ok: false,
        state: 'HELD',
        reason: 'The record is held — review it before running.',
        canRun: false,
      },
      { status: 409 },
    );
  }

  if (approved.length === 0) {
    return NextResponse.json(
      { ok: false, state: 'EMPTY', reason: 'Nothing approved to run yet.', canRun: false },
      { status: 409 },
    );
  }

  const selection = selectRunShifts(approved, holdShiftIds);
  if (selection.included.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        state: 'EMPTY',
        reason: 'Every approved shift was held — nothing left to run.',
        canRun: false,
      },
      { status: 409 },
    );
  }
  // payPeriod start/end are non-null because included.length > 0.
  const payPeriodStart = selection.payPeriodStart as string;
  const payPeriodEnd = selection.payPeriodEnd as string;

  // ── Gate 2: kill switch (only when PAYRUN_RUN_ENABLED='false') ──────
  if (!payrunRunEnabled()) {
    log.info({ companyId, included: selection.included.length }, 'payruns.run.ready_but_locked');
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
  const assembled = await assemblePayrollExport({
    companyId,
    adminUserId: userId,
    providerId: 'employment_hero',
    payPeriodStart,
    payPeriodEnd,
    shifts: selection.included,
  });

  if (!assembled.ok) {
    log.error({ status: assembled.status, error: assembled.error }, 'payruns.run.export_failed');
    return NextResponse.json(
      { ok: false, error: assembled.error, details: assembled.details },
      { status: assembled.status },
    );
  }

  // The decision — what was included, what was held — is part of the audit
  // record, supporting a clean voluntary disclosure if one is ever needed.
  const heldNote = selection.heldOut.length > 0 ? `; held ${selection.heldOut.length}` : '';
  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'export',
    resourceId: assembled.exportId,
    action: 'export',
    reasonCode: `payrun_run_when_safe; included ${selection.included.length}${heldNote}`,
    request,
  });

  return NextResponse.json(
    {
      ok: true,
      exportId: assembled.exportId,
      shiftCount: assembled.shiftCount,
      heldCount: selection.heldOut.length,
    },
    { status: 200 },
  );
}
