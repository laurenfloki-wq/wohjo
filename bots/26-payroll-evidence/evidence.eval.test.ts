// Golden evals — bot 26 (payroll-evidence), WLES-grounded.

import { describe, it, expect } from 'vitest';
import {
  buildEvidence,
  guardEvidenceAnswer,
  assertEvidenceUsable,
  type SealedRecord,
} from './handler';
import { GuardError } from '../../platform/guard';

const verified: SealedRecord = {
  receiptId: 'rcpt_123',
  workerId: 'w1',
  shiftDate: '2026-06-20',
  startTime: '07:00',
  endTime: '15:30',
  breakMinutes: 30,
  totalHours: 8,
  sealHash: 'abc123',
  sealVerified: true,
};

describe('bot 26 — payroll evidence (WLES-grounded)', () => {
  it('answers from a verified sealed record, citing the receipt', () => {
    const e = buildEvidence(verified);
    expect(e.sourceId).toBe('rcpt_123');
    expect(e.facts.totalHours).toBe(8);
    expect(e.facts.sealHash).toBe('abc123');
  });

  it('refuses an unverified seal (route to dispute, not present)', () => {
    expect(() => buildEvidence({ ...verified, sealVerified: false })).toThrow(GuardError);
    try {
      assertEvidenceUsable({ ...verified, sealVerified: false });
    } catch (err) {
      expect((err as GuardError).code).toBe('SEAL_UNVERIFIED');
    }
  });

  it('refuses a record with no seal', () => {
    try {
      assertEvidenceUsable({ ...verified, sealHash: '' });
    } catch (err) {
      expect((err as GuardError).code).toBe('SEAL_MISSING');
    }
  });

  it('the answer must cite exactly the sealed record', () => {
    expect(() => guardEvidenceAnswer(verified, ['rcpt_123'])).not.toThrow();
    expect(() => guardEvidenceAnswer(verified, ['rcpt_999'])).toThrow(GuardError);
    expect(() => guardEvidenceAnswer(verified, [])).toThrow(GuardError);
  });
});
