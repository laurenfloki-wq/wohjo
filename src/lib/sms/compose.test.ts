// Flostruction — SMS Compose Tests
// Tests the batch SMS message composition logic.

import { describe, it, expect } from 'vitest';
import {
  composeBatchSMS,
  composeLateShiftSMS,
  extractCode,
  type ShiftForSMS,
} from './compose';

// ─── Joao test scenario (the test that never changes) ───────────────────────
// Joao worked 8 hours. 7:00am start. 3:30pm finish. 30min break. $28.47/hr.
// Flag nothing. Route to approval. Export correctly.

const joaoClean: ShiftForSMS = {
  receiptId: 'FSTR-ABC123',
  workerFirstName: 'Joao',
  workerLastName: 'Silva',
  totalHours: 8,
  siteName: 'Barangaroo',
  anomalyFlags: [],
};

const flaggedShift: ShiftForSMS = {
  receiptId: 'FSTR-XYZ789',
  workerFirstName: 'Mike',
  workerLastName: 'Chen',
  totalHours: 14.5,
  siteName: 'Barangaroo',
  anomalyFlags: [
    {
      ruleId: 'RULE_001',
      severity: 'HIGH',
      explanation: 'Mike submitted 14.5 hours. Shifts over 12 hours are unusual.',
      action: 'Check with Mike and adjust if needed.',
    },
  ],
};

const mediumFlaggedShift: ShiftForSMS = {
  receiptId: 'FSTR-QRS456',
  workerFirstName: 'Ana',
  workerLastName: 'Torres',
  totalHours: 1.5,
  siteName: 'Darling Harbour',
  anomalyFlags: [
    {
      ruleId: 'RULE_002',
      severity: 'MEDIUM',
      explanation: 'Ana submitted 1.5 hours. This is a very short shift.',
      action: 'Confirm shift was completed as submitted.',
    },
  ],
};

describe('extractCode', () => {
  it('returns last 6 chars of receipt_id', () => {
    expect(extractCode('FSTR-ABC123')).toBe('ABC123');
  });

  it('handles longer receipt IDs', () => {
    expect(extractCode('FSTR-ABCDEFGH')).toBe('CDEFGH');
  });
});

describe('composeBatchSMS', () => {
  const backupUrl = 'https://flosmosis.com/v/test-token';

  it('composes clean-only SMS (Joao scenario)', () => {
    const msg = composeBatchSMS({ shifts: [joaoClean], backupUrl });
    expect(msg).toContain('Flostruction: 1 timesheet(s) from your crew.');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Reply YES ALL to approve.');
    // No backup URL for clean-only
    expect(msg).not.toContain('Details:');
  });

  it('composes flagged-only SMS', () => {
    const msg = composeBatchSMS({ shifts: [flaggedShift], backupUrl });
    expect(msg).toContain('Flostruction: 1 timesheet(s) need your review.');
    expect(msg).toContain('Mike Chen - 14.5hrs Barangaroo XYZ789');
    expect(msg).toContain('REVIEW:');
    expect(msg).toContain('Reply YES [code] to approve or NO [code] to flag each.');
    expect(msg).toContain(`Details: ${backupUrl}`);
  });

  it('composes mixed SMS (clean + flagged)', () => {
    const msg = composeBatchSMS({
      shifts: [joaoClean, flaggedShift],
      backupUrl,
    });
    expect(msg).toContain('Flostruction: 2 timesheet(s) from your crew.');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Mike Chen - 14.5hrs Barangaroo XYZ789');
    expect(msg).toContain('Reply YES ALL for the first 1 (clean).');
    expect(msg).toContain('Reply YES [code] or NO [code] for Mike.');
    expect(msg).toContain(`Details: ${backupUrl}`);
  });

  it('formats hours with one decimal place (no trailing zero)', () => {
    const msg = composeBatchSMS({ shifts: [joaoClean], backupUrl });
    expect(msg).toContain('8hrs');
    expect(msg).not.toContain('8.0hrs');
  });

  it('formats half-hours correctly', () => {
    const halfHourShift: ShiftForSMS = {
      ...joaoClean,
      totalHours: 8.5,
    };
    const msg = composeBatchSMS({ shifts: [halfHourShift], backupUrl });
    expect(msg).toContain('8.5hrs');
  });

  it('shows plain English review flag, not rule code', () => {
    const msg = composeBatchSMS({ shifts: [flaggedShift], backupUrl });
    expect(msg).not.toContain('RULE_001');
    expect(msg).toContain('REVIEW:');
    // Should contain a human-readable description
    expect(msg).toMatch(/REVIEW: .+hrs claimed/);
  });

  it('handles MEDIUM severity flag', () => {
    const msg = composeBatchSMS({ shifts: [mediumFlaggedShift], backupUrl });
    expect(msg).toContain('REVIEW:');
    expect(msg).not.toContain('RULE_002');
  });

  it('handles multiple clean shifts', () => {
    const shift2: ShiftForSMS = {
      ...joaoClean,
      receiptId: 'FSTR-DEF456',
      workerFirstName: 'Maria',
      workerLastName: 'Santos',
      totalHours: 7.5,
    };
    const msg = composeBatchSMS({ shifts: [joaoClean, shift2], backupUrl });
    expect(msg).toContain('Flostruction: 2 timesheet(s) from your crew.');
    expect(msg).toContain('Joao Silva');
    expect(msg).toContain('Maria Santos');
    expect(msg).toContain('Reply YES ALL to approve.');
  });
});

describe('composeLateShiftSMS', () => {
  const backupUrl = 'https://flosmosis.com/v/test-token';

  it('composes late clean shift SMS', () => {
    const msg = composeLateShiftSMS({ shift: joaoClean, backupUrl });
    expect(msg).toContain('Flostruction: Late timesheet from Joao Silva.');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Reply YES ABC123 to approve.');
    expect(msg).not.toContain('Details:');
  });

  it('composes late flagged shift SMS', () => {
    const msg = composeLateShiftSMS({ shift: flaggedShift, backupUrl });
    expect(msg).toContain('Flostruction: Late timesheet from Mike Chen.');
    expect(msg).toContain('REVIEW:');
    expect(msg).toContain('Reply YES XYZ789 to approve or NO XYZ789 to flag.');
    expect(msg).toContain(`Details: ${backupUrl}`);
  });
});
