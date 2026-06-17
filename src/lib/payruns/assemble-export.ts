// Pay-run export assembly — the shared money path for "Run when safe".
//
// Formats the approved shifts through a registered provider formatter,
// creates the `exports` row, seals a WLES EXPORT_RECORD event per shift
// (v1 in TS via sealEvent — NEVER in SQL, a byte-mismatch corrupts the
// verifier; v0 fallback when the v1 flag is off), and transitions each
// shift to EXPORTED. Mirrors the per-shift sealing the /command/export
// route does inline (that route is pinned by a repo-confinement test and
// must keep its inline form, so this helper is the parallel canonical path
// for the page surface). All writes go through companyId-scoped repos.

import { createHash } from 'crypto';
import { generateEventHash } from '@/lib/wles/hash';
import { isWlesV1Enabled } from '@/lib/wles/flags';
import { sealEvent } from '@/lib/wles/v1';
import { buildExportRecord } from '@/lib/wles/v1-translate';
import {
  exportChainTail,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';
import { exportsRepo } from '@/lib/db/repositories/exports.repo';
import { getFormatter } from '@/lib/export/formatters';
import type { ApprovedShift } from '@/lib/export/types';

export interface AssembleExportInput {
  companyId: string;
  adminUserId: string;
  providerId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  shifts: ApprovedShift[];
}

export interface AssembleExportOk {
  ok: true;
  exportId: string;
  fileHash: string;
  content: string;
  fileName: string;
  shiftCount: number;
  totalHours: number;
  providerName: string;
}

export interface AssembleExportErr {
  ok: false;
  status: number;
  error: string;
  details?: unknown;
}

export type AssembleExportResult = AssembleExportOk | AssembleExportErr;

export async function assemblePayrollExport(
  input: AssembleExportInput,
): Promise<AssembleExportResult> {
  const { companyId, adminUserId, providerId, payPeriodStart, payPeriodEnd, shifts } = input;

  // 1. Formatter (throws on an unregistered/unvalidated provider).
  const formatter = getFormatter(providerId);

  if (shifts.length === 0) {
    return { ok: false, status: 404, error: 'No approved shifts found for this pay period' };
  }

  // 2. Validate, then format.
  const validationErrors = formatter.validate(shifts);
  if (validationErrors.length > 0) {
    return { ok: false, status: 422, error: 'Validation failed', details: validationErrors };
  }

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
  const fileName = `Flostruction_Export_${providerId}_${payPeriodStart}_to_${payPeriodEnd}.${formatter.fileExtension}`;

  const expRepo = exportsRepo(companyId);
  const repo = shiftsMutationRepo(companyId);
  const evRepo = shiftEventsMutationRepo(companyId);
  const now = new Date();

  // 3. Create the export record.
  const { data: exportRecord, error: exportError } = await expRepo.insertExport({
    pay_period_start: payPeriodStart,
    pay_period_end: payPeriodEnd,
    export_target: providerId,
    shift_ids: shifts.map((s) => s.id),
    total_shifts: shifts.length,
    total_hours: totalHours.toFixed(2),
    file_hash: fileHash,
    exported_by: adminUserId,
    exported_at: now.toISOString(),
  });

  if (exportError || !exportRecord) {
    return {
      ok: false,
      status: 500,
      error: `Failed to create export record: ${exportError?.message ?? 'unknown'}`,
    };
  }

  // 4. Seal a WLES EXPORT_RECORD per shift + transition to EXPORTED.
  for (const shift of shifts) {
    const eventData = {
      shift_id: shift.id,
      receipt_id: shift.receipt_id,
      export_id: exportRecord.id,
      provider: providerId,
      file_hash: fileHash,
    };

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
        provider: providerId,
        fileHash,
      });
      const sealed = sealEvent(unsealed);
      await evRepo.insertV1(sealed, {
        companyId: shift.company_id,
        workerId: shift.worker_id,
        siteId: shift.site_id ?? null,
        createdBy: adminUserId,
        // Substrate column stays canonical 'EXPORT_RECORD' (m0d); the WLES
        // type 'X-FLOSMOSIS-EXPORT_RECORD' lives in wles_event.
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

    await repo.markExported(shift.id, exportRecord.id, now.toISOString());
  }

  return {
    ok: true,
    exportId: exportRecord.id,
    fileHash,
    content,
    fileName,
    shiftCount: shifts.length,
    totalHours: parseFloat(totalHours.toFixed(2)),
    providerName: formatter.providerName,
  };
}
