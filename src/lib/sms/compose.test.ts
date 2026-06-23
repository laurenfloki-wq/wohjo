// Flostruction — SMS Compose Tests
// Tests the batch SMS message composition logic.

import { describe, it, expect } from 'vitest';
import {
  composeBatchSMS,
  composeLateShiftSMS,
  extractCode,
  formatWorkerVerifiedSms,
  type ShiftForSMS,
  type WorkerVerifiedSmsInput,
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
    expect(msg).toContain('FLOSTRUCTION — 1 shift from your crew need your OK for pay:');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Reply YES ALL to approve');
    // Review link now offered on clean batches too (one-tap review path)
    expect(msg).toContain(backupUrl);
  });

  it('composes flagged-only SMS', () => {
    const msg = composeBatchSMS({ shifts: [flaggedShift], backupUrl });
    expect(msg).toContain('FLOSTRUCTION — 1 shift need a closer look before pay:');
    expect(msg).toContain('Mike Chen - 14.5hrs Barangaroo XYZ789');
    expect(msg).toContain('REVIEW:');
    expect(msg).toContain('Reply YES [code] to approve or NO [code] to flag.');
    expect(msg).toContain(`Tap to review: ${backupUrl}`);
  });

  it('composes mixed SMS (clean + flagged)', () => {
    const msg = composeBatchSMS({
      shifts: [joaoClean, flaggedShift],
      backupUrl,
    });
    expect(msg).toContain('FLOSTRUCTION — 2 shifts from your crew need your OK:');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Mike Chen - 14.5hrs Barangaroo XYZ789');
    expect(msg).toContain('Reply YES ALL for the first 1 (clean).');
    expect(msg).toContain('For Mike: reply YES [code] or NO [code].');
    expect(msg).toContain(`Tap to review all: ${backupUrl}`);
  });

  it('adds an aging nudge when shifts have been waiting since before today', () => {
    const msg = composeBatchSMS({ shifts: [joaoClean], backupUrl, staleCount: 2 });
    expect(msg).toContain('Heads up: 2 shifts have been waiting since before today');
    // No nudge when nothing is stale
    const fresh = composeBatchSMS({ shifts: [joaoClean], backupUrl, staleCount: 0 });
    expect(fresh).not.toContain('Heads up:');
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
    expect(msg).toContain('FLOSTRUCTION — 2 shifts from your crew need your OK for pay:');
    expect(msg).toContain('Joao Silva');
    expect(msg).toContain('Maria Santos');
    expect(msg).toContain('Reply YES ALL to approve');
  });
});

describe('composeLateShiftSMS', () => {
  const backupUrl = 'https://flosmosis.com/v/test-token';

  it('composes late clean shift SMS', () => {
    const msg = composeLateShiftSMS({ shift: joaoClean, backupUrl });
    expect(msg).toContain('FLOSTRUCTION — late timesheet from Joao Silva:');
    expect(msg).toContain('Joao Silva - 8hrs Barangaroo ABC123');
    expect(msg).toContain('Reply YES ABC123 to approve.');
    expect(msg).not.toContain('Tap to review:');
  });

  it('composes late flagged shift SMS', () => {
    const msg = composeLateShiftSMS({ shift: flaggedShift, backupUrl });
    expect(msg).toContain('FLOSTRUCTION — late timesheet from Mike Chen:');
    expect(msg).toContain('REVIEW:');
    expect(msg).toContain('Reply YES XYZ789 to approve or NO XYZ789 to flag.');
    expect(msg).toContain(`Tap to review: ${backupUrl}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatWorkerVerifiedSms — Blocker 2 wording (added 2026-04-30 evening)
// ─────────────────────────────────────────────────────────────────────────────
describe('formatWorkerVerifiedSms — verified-shift body', () => {
  function makeInput(over: Partial<WorkerVerifiedSmsInput> = {}): WorkerVerifiedSmsInput {
    const defaults: WorkerVerifiedSmsInput = {
      receiptId: 'FSTR-ABC12345',
      hoursWorked: '8.00',
      startSource: 'GEOFENCE_CONFIRMED',
      geofenceDetectedAt: '2026-04-30T21:00:00Z', // 07:00 AEST (UTC+10)
      workerConfirmedStartAt: '2026-04-30T21:00:00Z',
      approvedAt: '2026-04-30T06:35:00Z', // 16:35 AEST → 4:35pm
      supervisorName: 'Lauren de Mestre',
      publicReceiptUrl: 'https://flosmosis.com/field/receipt/FSTR-ABC12345',
    };
    return { ...defaults, ...over };
  }

  it('opens with the FLOSTRUCTION verified header and receipt id', () => {
    const msg = formatWorkerVerifiedSms(makeInput());
    expect(msg.startsWith('FLOSTRUCTION — Shift verified.\nFSTR-ABC12345\n')).toBe(true);
  });

  it('uses the new "Sealed and verified" closing line (not "INTACT")', () => {
    const msg = formatWorkerVerifiedSms(makeInput());
    expect(msg).toContain('Sealed and verified — https://flosmosis.com/field/receipt/FSTR-ABC12345');
    expect(msg).not.toContain('INTACT');
  });

  it('names the supervisor in the approval line ("Approved by <name> at <12h time>")', () => {
    const msg = formatWorkerVerifiedSms(makeInput());
    // 06:35 UTC == 16:35 AEST == "4:35pm" in 12-hour format.
    expect(msg).toContain('Approved by Lauren de Mestre at 4:35pm');
    // Old wording must be gone.
    expect(msg).not.toMatch(/Approved: /);
    expect(msg).not.toMatch(/AEST$/m);
  });

  it('GEOFENCE_CONFIRMED keeps the existing "GPS arrival: HH:MM" line', () => {
    const msg = formatWorkerVerifiedSms(makeInput({ startSource: 'GEOFENCE_CONFIRMED' }));
    // 21:00 UTC == 07:00 AEST.
    expect(msg).toContain('GPS arrival: 07:00');
  });

  it('GEOFENCE_ADJUSTED keeps the "Started: HH:MM (GPS HH:MM)" variant', () => {
    const msg = formatWorkerVerifiedSms(
      makeInput({
        startSource: 'GEOFENCE_ADJUSTED',
        workerConfirmedStartAt: '2026-04-30T21:05:00Z', // 07:05 AEST
        geofenceDetectedAt: '2026-04-30T21:00:00Z', // 07:00 AEST
      }),
    );
    expect(msg).toContain('Started: 07:05 (GPS 07:00)');
  });

  it('MANUAL keeps the "Started: HH:MM (manual)" variant', () => {
    const msg = formatWorkerVerifiedSms(
      makeInput({
        startSource: 'MANUAL',
        geofenceDetectedAt: null,
        workerConfirmedStartAt: '2026-04-30T21:00:00Z',
      }),
    );
    expect(msg).toContain('Started: 07:00 (manual)');
  });

  it('full body fits within Twilio 2-segment GSM-7 budget (306 chars)', () => {
    const msg = formatWorkerVerifiedSms(makeInput());
    // Concatenated SMS in GSM-7 carries 153 chars per segment; 2 segments
    // == 306 chars. We allow up to 306 to keep delivery cost bounded at
    // 2 segments. If supervisor names get unusually long, this guard
    // surfaces it as a test failure rather than a silent third segment.
    expect(msg.length).toBeLessThanOrEqual(306);
  });
});
