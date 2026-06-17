// Flostruction Command â CSV Export
// POST /api/command/export
// Fetches approved shifts, formats via provider formatter, creates WLES EXPORT_RECORD events,
// records to exports table, and returns the file content.
//
// Body: { pay_period_start, pay_period_end, provider_id }
//        (admin_user_id is tolerated for backward compatibility but ignored;
//         admin identity is derived from the session — CRACK 218 audit.)
// Returns: { success, export_id, file_name, content, shift_count, total_hours }
// Day 5 P1.2 — company_id derived server-side via admins table (GAP-A3-001 closure).

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildExportRecord } from '@/lib/wles/v1-translate';
// W1.3 (2026-06-10): all DB access flows through companyId-scoped
// repositories; v1-chain helpers are reached via the repo pass-throughs.
import {
  exportChainTail,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';
import { exportsRepo } from '@/lib/db/repositories/exports.repo';
import { getApprovedShifts } from '@/lib/export/get-approved-shifts';
import { getFormatter } from '@/lib/export/formatters';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/security/rate-limit';

import { routeLogger } from '@/lib/logger';
interface ExportRequestBody {
  pay_period_start: string;
  pay_period_end: string;
  provider_id: string;
  // CRACK 218 audit: admin_user_id is no longer trusted from the client;
  // tolerated in the type for backward compatibility, but ignored.
  admin_user_id?: string;
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/export', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  // Day 5 P1.2 — company_id now derived server-side via getCompanyIdForSession.
  // CRACK 218 audit fix: also derive the admin's auth.users.id for the
  // exports.exported_by UUID column. Previously the client supplied
  // admin_user_id and the route passed it through unverified — a 400
  // invalid-UUID waiting to happen.
  let companyId: string;
  let adminUserId: string;
  try {
    ({ companyId, userId: adminUserId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  // Rate limit check
  const clientIP = getClientIP(request);
  const rl = checkRateLimit(`export:${clientIP}`, RATE_LIMITS.EXPORT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as ExportRequestBody;

    const { pay_period_start, pay_period_end, provider_id } = body;

    if (!pay_period_start || !pay_period_end || !provider_id) {
      return NextResponse.json(
        { error: 'pay_period_start, pay_period_end, and provider_id required' },
        { status: 400 },
      );
    }

    // 1. Get formatter (throws if unknown provider)
    const formatter = getFormatter(provider_id);

    // 2. Fetch approved shifts
    const shifts = await getApprovedShifts({
      companyId,
      payPeriodStart: pay_period_start,
      payPeriodEnd: pay_period_end,
    });

    if (shifts.length === 0) {
      return NextResponse.json(
        { error: 'No approved shifts found for this pay period' },
        { status: 404 },
      );
    }

    // 3. Validate
    const validationErrors = formatter.validate(shifts);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 422 },
      );
    }

    // 4. Format
    const rawContent = formatter.format(shifts);
    const fileHash = createHash('sha256').update(rawContent).digest('hex');
    const exportTimestamp = new Date().toISOString();
    const content =
      rawContent +
      '\n# FLOSTRUCTION-EXPORT-SHA256: ' +
      fileHash +
      '\n# Generated: ' +
      exportTimestamp +
      '\n# Verified by WLES v1.0\n';
    const totalHours = shifts.reduce((sum, s) => sum + s.total_hours, 0);
    const fileName = `Flostruction_Export_${provider_id}_${pay_period_start}_to_${pay_period_end}.${formatter.fileExtension}`;

    // Scoped repositories (W1.3): the companyId binding equals every
    // shift.company_id by construction — getApprovedShifts predicates
    // .eq('company_id', companyId).
    const expRepo = exportsRepo(companyId);
    const repo = shiftsMutationRepo(companyId);
    const evRepo = shiftEventsMutationRepo(companyId);
    const now = new Date();

    // 5. Create export record
    const { data: exportRecord, error: exportError } = await expRepo.insertExport({
      pay_period_start,
      pay_period_end,
      export_target: provider_id,
      shift_ids: shifts.map((s) => s.id),
      total_shifts: shifts.length,
      total_hours: totalHours.toFixed(2),
      file_hash: fileHash,
      exported_by: adminUserId,
      exported_at: now.toISOString(),
    });

    if (exportError || !exportRecord) {
      return NextResponse.json(
        { error: `Failed to create export record: ${exportError?.message ?? 'unknown'}` },
        { status: 500 },
      );
    }

    // 6. Create WLES EXPORT_RECORD event for each shift + update shift status
    for (const shift of shifts) {
      const eventData = {
        shift_id: shift.id,
        receipt_id: shift.receipt_id,
        export_id: exportRecord.id,
        provider: provider_id,
        file_hash: fileHash,
      };

      // CRACK 219 defense-in-depth: ORDER BY id DESC tiebreaker prevents
      // non-deterministic chain-tail selection when two events share the same
      // millisecond created_at. See process_flostruction_export RPC for the
      // canonical multi-event pattern; this legacy route still loops in TS
      // so a same-ms collision would otherwise pick the wrong tail. Queued
      // for full RPC migration as CRACK 220.
      const { data: lastEvent } = await exportChainTail(shift.worker_id);

      const previousHash = lastEvent?.event_hash ?? null;

      if (isWlesV1Enabled() && shift.company_id) {
        const previousEventHash = await evRepo.v1ChainTail();
        const unsealed = buildExportRecord({
          actorId: adminUserId,
          subjectId: shift.worker_id,
          timestamp: now.toISOString(),
          previousEventHash,
          shiftId: shift.id,
          exportId: exportRecord.id,
          provider: provider_id,
          fileHash,
        });
        const sealed = sealEvent(unsealed);
        await evRepo.insertV1(sealed, {
          companyId: shift.company_id,
          workerId: shift.worker_id,
          siteId: shift.site_id ?? null,
          createdBy: adminUserId,
          // Substrate column stays canonical 'EXPORT_RECORD' (m0d); the
          // WLES type 'X-FLOSMOSIS-EXPORT_RECORD' lives in wles_event.
          eventTypeForSubstrate: 'EXPORT_RECORD',
          eventDataCompat: eventData,
        });
      } else {
        const hash = generateEventHash({
          company_id: shift.company_id,
          worker_id: shift.worker_id,
          site_id: shift.site_id,
          event_type: 'EXPORT_RECORD',
          event_data: eventData,
          created_at: now,
        });

        await evRepo.insertV0Event({
          worker_id: shift.worker_id,
          site_id: shift.site_id,
          event_type: 'EXPORT_RECORD',
          event_data: eventData,
          device_metadata: {},
          event_hash: hash,
          previous_event_hash: previousHash,
          created_at: now.toISOString(),
          created_by: adminUserId,
          spec_version: '0',
        });
      }

      // Update shift status to EXPORTED + link to export
      await repo.markExported(shift.id, exportRecord.id, now.toISOString());
    }

    // 7. Return result
    return NextResponse.json({
      success: true,
      export_id: exportRecord.id,
      file_name: fileName,
      content,
      shift_count: shifts.length,
      total_hours: parseFloat(totalHours.toFixed(2)),
      file_hash: fileHash,
      provider: formatter.providerName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
