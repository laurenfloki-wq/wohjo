// Golden evals — bot 26 (worker payroll-evidence). Sealed-record grounding only.

import { describe, it, expect } from 'vitest';
import { buildEvidence, guardEvidenceAnswer, type SealedRecord } from './handler';
import { GuardError } from '../../platform/guard';

const record: SealedRecord = {
  receiptId: 'rcpt_123',
  workerId: 'w1',
  shiftDate: '2026-06-20',
  startTime: '07:00',
  endTime: '15:30',
  breakMinutes: 30,
  totalHours: 8,
  sealHash: 'abc123',
};

describe('bot 26 — payroll evidence', () => {
  it('builds facts only from the sealed record, citing the receipt', () => {
    const e = buildEvidence(record);
    expect(e.sourceId).toBe('rcpt_123');
    expect(e.facts.totalHours).toBe(8);
    expect(e.facts.sealHash).toBe('abc123');
  });

  it('guards: the answer must cite exactly the sealed record', () => {
    expect(() => guardEvidenceAnswer(record, ['rcpt_123'])).not.toThrow();
    expect(() => guardEvidenceAnswer(record, ['rcpt_999'])).toThrow(GuardError);
    expect(() => guardEvidenceAnswer(record, [])).toThrow(GuardError);
  });
});
