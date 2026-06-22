// Bot 26 — Worker payroll-evidence.
//
// Trigger: worker question (HTTP/chat) | Runtime: EF | Gate: T0 | Model: Haiku
// (phrase). Pulls the sealed record deterministically, Haiku phrases it, and
// assertGrounded ensures the answer only ever cites the sealed record — never
// speculation. Payroll facts must come from sealed records (HARD CONSTRAINT 8).

import { assertGrounded } from '../../platform/guard';

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
}

export interface EvidenceAnswer {
  /** Deterministic factual summary drawn only from the sealed record. */
  facts: Record<string, string | number>;
  /** The single source id the phrased answer must cite. */
  sourceId: string;
}

/**
 * Pure: build the factual answer payload from a sealed record. The phrasing LLM
 * is given exactly these facts and must cite `sourceId`; guardEvidenceAnswer
 * enforces that, so an answer can never include an unsourced payroll claim.
 */
export function buildEvidence(record: SealedRecord): EvidenceAnswer {
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
