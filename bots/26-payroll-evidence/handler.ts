// Bot 26 — Worker payroll-evidence (FLOSMOSIS-calibrated, WLES-grounded).
//
// Trigger: worker question (HTTP/chat) | Runtime: EF | Gate: T0 | Model: Haiku
// (phrase). This is the product's trust surface. It answers a worker's question
// STRICTLY from their sealed record, and only when that record's seal is
// verified — an unverified or broken seal is not evidence under WLES, so the bot
// refuses and routes to a dispute/human rather than present it. The answer must
// cite exactly the receipt (assertGrounded), so a payroll claim can never be
// unsourced or speculated.

import { assertGrounded, GuardError } from '../../platform/guard';

export const BOT_ID = 'bot-26-payroll-evidence';

export interface SealedRecord {
  receiptId: string;
  workerId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalHours: number;
  sealHash: string;
  /** Whether the WLES hash chain for this record verified. Only true = evidence. */
  sealVerified: boolean;
}

export interface EvidenceAnswer {
  facts: Record<string, string | number>;
  sourceId: string;
}

/**
 * Assert the record is usable as evidence: it must carry a seal hash AND have
 * verified. A broken/absent seal is not WLES evidence — throw so the caller
 * routes the worker to a dispute/human instead of presenting unverifiable data.
 */
export function assertEvidenceUsable(record: SealedRecord): void {
  if (!record.sealHash) {
    throw new GuardError('SEAL_MISSING', 'Record has no seal; not WLES evidence.');
  }
  if (!record.sealVerified) {
    throw new GuardError(
      'SEAL_UNVERIFIED',
      'Record seal did not verify; route to dispute, do not present.',
    );
  }
}

/**
 * Build the factual answer payload from a VERIFIED sealed record. Throws via
 * assertEvidenceUsable if the seal is missing/unverified.
 */
export function buildEvidence(record: SealedRecord): EvidenceAnswer {
  assertEvidenceUsable(record);
  return {
    facts: {
      shiftDate: record.shiftDate,
      startTime: record.startTime,
      endTime: record.endTime,
      breakMinutes: record.breakMinutes,
      totalHours: record.totalHours,
      sealHash: record.sealHash,
    },
    sourceId: record.receiptId,
  };
}

/** Guard: the phrased answer must cite exactly the sealed record. */
export function guardEvidenceAnswer(record: SealedRecord, citedIds: ReadonlyArray<string>): void {
  assertGrounded({ sources: [{ id: record.receiptId }], citedIds });
}
