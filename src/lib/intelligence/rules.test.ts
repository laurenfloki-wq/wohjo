// Flostruction Intelligence — Rules Engine Tests
// 100% coverage required on all 7 rules, computeConfidenceScore, runAllRules,
// isEligibleForBulkApproval, and confidenceLabel.
// The Joao test is canonical and runs in every describe block that exercises runAllRules.

import { describe, it, expect } from 'vitest';
import {
  checkRule001,
  checkRule002,
  checkRule003,
  checkRule004,
  checkRule005,
  checkRule006,
  checkRule007,
  checkRule008,
  checkRule009,
  checkRule010,
  checkRule011,
  checkRule012,
  computeConfidenceScore,
  runAllRules,
  isEligibleForBulkApproval,
  confidenceLabel,
  type ShiftForRules,
  type WorkerHistory,
  type ConfidenceInputs,
  type ApprovalBatch,
} from './rules';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture factory
// April 22, 2026 = Wednesday (weekday). Non-negotiable Joao scenario date.
// ─────────────────────────────────────────────────────────────────────────────
const JOAO_DATE = '2026-04-22';
const SATURDAY_DATE = '2026-04-25'; // getDay() = 6
const SUNDAY_DATE = '2026-04-26';   // getDay() = 0

function makeShift(overrides: Partial<ShiftForRules> = {}): ShiftForRules {
  const start = new Date('2026-04-22T07:00:00+10:00');
  const end = new Date('2026-04-22T15:30:00+10:00');
  return {
    id: 'shift-joao-001',
    worker_first_name: 'Joao',
    site_name: 'Parramatta Site A',
    shift_date: JOAO_DATE,
    start_time: start,
    end_time: end,
    break_minutes: 30,
    total_hours: 8,
    submitted_at: end, // submitted immediately at shift end
    gps_captured: true,
    gps_distance_from_site_metres: 50,  // well within 200m geofence
    gps_accuracy_metres: 10,
    worker_id: 'worker-joao',
    company_id: 'company-dass',
    site_id: 'site-parramatta-a',
    ...overrides,
  };
}

// Each number in the array is the total_hours for that shift
function makeHistory(hoursList: number[]): WorkerHistory {
  return { shifts: hoursList.map(h => ({ total_hours: h })) };
}

const NO_HISTORY: WorkerHistory = { shifts: [] };
const GEOFENCE_RADIUS = 200;

// ─────────────────────────────────────────────────────────────────────────────
// THE TEST THAT NEVER CHANGES
// Joao: 8 hrs, 7am start, 3:30pm finish, 30min break, $28.47/hr
// Must produce ZERO flags and be eligible for bulk approval.
// ─────────────────────────────────────────────────────────────────────────────
describe('Joao canonical test — The Test That Never Changes', () => {
  const joao = makeShift();

  it('RULE_001 does not fire for Joao', () => {
    expect(checkRule001(joao).triggered).toBe(false);
  });

  it('RULE_002 does not fire for Joao', () => {
    expect(checkRule002(joao).triggered).toBe(false);
  });

  it('RULE_003 does not fire for Joao (within geofence)', () => {
    expect(checkRule003(joao, GEOFENCE_RADIUS).triggered).toBe(false);
  });

  it('RULE_004 does not fire for Joao (no duplicate)', () => {
    expect(checkRule004(joao, 0).triggered).toBe(false);
  });

  it('RULE_005 does not fire for Joao (new worker, < 4 shifts history)', () => {
    expect(checkRule005(joao, NO_HISTORY).triggered).toBe(false);
  });

  it('RULE_006 does not fire for Joao (submitted immediately)', () => {
    expect(checkRule006(joao).triggered).toBe(false);
  });

  it('RULE_007 does not fire for Joao (Wednesday)', () => {
    expect(checkRule007(joao).triggered).toBe(false);
  });

  it('RULE_008 does not fire for Joao (50m from site, well under 50km)', () => {
    expect(checkRule008(joao).triggered).toBe(false);
  });

  it('runAllRules returns zero flags for Joao', () => {
    const flags = runAllRules(joao, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags).toHaveLength(0);
  });

  it('Joao is eligible for YES ALL bulk approval', () => {
    const flags = runAllRules(joao, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(isEligibleForBulkApproval(flags)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_001 — Hours Too Long (> 12 hrs) — HIGH
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_001 — Hours Too Long', () => {
  it('does NOT trigger for exactly 12 hours (boundary)', () => {
    const result = checkRule001(makeShift({ total_hours: 12 }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger for 8 hours (normal shift)', () => {
    expect(checkRule001(makeShift({ total_hours: 8 })).triggered).toBe(false);
  });

  it('TRIGGERS for 12.1 hours (just over boundary)', () => {
    const result = checkRule001(makeShift({ total_hours: 12.1 }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_001');
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('TRIGGERS for 13 hours', () => {
    const result = checkRule001(makeShift({ total_hours: 13 }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('flag explanation includes worker first name and hours', () => {
    const result = checkRule001(makeShift({ total_hours: 14, worker_first_name: 'Joao' }));
    expect(result.flag?.explanation).toContain('Joao');
    expect(result.flag?.explanation).toContain('14.0');
  });

  it('flag explanation uses correct worker name', () => {
    const result = checkRule001(makeShift({ total_hours: 14, worker_first_name: 'Maria' }));
    expect(result.flag?.explanation).toContain('Maria');
    expect(result.flag?.action).toContain('Maria');
  });

  it('does NOT trigger for 0 hours (handled by RULE_002)', () => {
    expect(checkRule001(makeShift({ total_hours: 0 })).triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_002 — Hours Very Short (< 2 hrs) — MEDIUM
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_002 — Hours Very Short', () => {
  it('does NOT trigger for exactly 2 hours (boundary)', () => {
    expect(checkRule002(makeShift({ total_hours: 2 })).triggered).toBe(false);
  });

  it('does NOT trigger for 8 hours', () => {
    expect(checkRule002(makeShift({ total_hours: 8 })).triggered).toBe(false);
  });

  it('TRIGGERS for 1.9 hours (just under boundary)', () => {
    const result = checkRule002(makeShift({ total_hours: 1.9 }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_002');
    expect(result.flag?.severity).toBe('MEDIUM');
  });

  it('TRIGGERS for 0 hours', () => {
    const result = checkRule002(makeShift({ total_hours: 0 }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('MEDIUM');
  });

  it('TRIGGERS for 1 hour', () => {
    const result = checkRule002(makeShift({ total_hours: 1 }));
    expect(result.triggered).toBe(true);
  });

  it('flag explanation includes worker name and hours', () => {
    const result = checkRule002(makeShift({ total_hours: 0.5, worker_first_name: 'Joao' }));
    expect(result.flag?.explanation).toContain('Joao');
    expect(result.flag?.explanation).toContain('0.5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_003 — GPS Outside Geofence — MEDIUM
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_003 — GPS Outside Geofence', () => {
  it('does NOT trigger when GPS not captured', () => {
    const result = checkRule003(
      makeShift({ gps_captured: false, gps_distance_from_site_metres: 500 }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS captured but distance is null', () => {
    const result = checkRule003(
      makeShift({ gps_captured: true, gps_distance_from_site_metres: null }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS within geofence (50m, radius 200m)', () => {
    const result = checkRule003(
      makeShift({ gps_captured: true, gps_distance_from_site_metres: 50, gps_accuracy_metres: 10 }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS exactly at boundary (200m)', () => {
    const result = checkRule003(
      makeShift({ gps_captured: true, gps_distance_from_site_metres: 200, gps_accuracy_metres: 10 }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS outside geofence but accuracy >= 100m (unreliable GPS)', () => {
    const result = checkRule003(
      makeShift({
        gps_captured: true,
        gps_distance_from_site_metres: 500,
        gps_accuracy_metres: 100, // exactly 100 — not < 100
      }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when accuracy is null', () => {
    const result = checkRule003(
      makeShift({ gps_captured: true, gps_distance_from_site_metres: 500, gps_accuracy_metres: null }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(false);
  });

  it('TRIGGERS when GPS outside geofence with good accuracy', () => {
    const result = checkRule003(
      makeShift({
        gps_captured: true,
        gps_distance_from_site_metres: 350,
        gps_accuracy_metres: 10,
      }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_003');
    expect(result.flag?.severity).toBe('MEDIUM');
  });

  it('flag includes worker name, distance, and site name', () => {
    const result = checkRule003(
      makeShift({
        worker_first_name: 'Joao',
        site_name: 'Parramatta Site A',
        gps_captured: true,
        gps_distance_from_site_metres: 350,
        gps_accuracy_metres: 10,
      }),
      GEOFENCE_RADIUS
    );
    expect(result.flag?.explanation).toContain('350');
    expect(result.flag?.explanation).toContain('Parramatta Site A');
    expect(result.flag?.explanation).toContain('Joao');
    expect(result.flag?.action).toContain('Joao');
  });

  it('TRIGGERS with accuracy just under 100 (99m)', () => {
    const result = checkRule003(
      makeShift({
        gps_captured: true,
        gps_distance_from_site_metres: 300,
        gps_accuracy_metres: 99,
      }),
      GEOFENCE_RADIUS
    );
    expect(result.triggered).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_004 — Duplicate Shift — HIGH
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_004 — Duplicate Shift', () => {
  it('does NOT trigger when existingShiftCount is 0', () => {
    expect(checkRule004(makeShift(), 0).triggered).toBe(false);
  });

  it('TRIGGERS when existingShiftCount is 1', () => {
    const result = checkRule004(makeShift(), 1);
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_004');
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('TRIGGERS when existingShiftCount is > 1 (multiple duplicates)', () => {
    const result = checkRule004(makeShift(), 2);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('flag explanation includes worker name', () => {
    const result = checkRule004(makeShift({ worker_first_name: 'Joao' }), 1);
    expect(result.flag?.explanation).toContain('Joao');
  });

  it('flag action instructs supervisor to reject duplicate', () => {
    const result = checkRule004(makeShift(), 1);
    expect(result.flag?.action).toMatch(/reject|review/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_005 — Hours Above Average — LOW
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_005 — Hours Above Worker Average', () => {
  it('does NOT trigger with empty history', () => {
    expect(checkRule005(makeShift(), { shifts: [] }).triggered).toBe(false);
  });

  it('does NOT trigger with exactly 3 shifts history (need > 3)', () => {
    const history = makeHistory([8, 8, 8]);
    expect(checkRule005(makeShift(), history).triggered).toBe(false);
  });

  it('does NOT trigger with 4 shifts at same average', () => {
    const history = makeHistory([8, 8, 8, 8]);
    // total_hours = 8, avg = 8, 8 > 8 * 1.4 = 11.2 → false
    expect(checkRule005(makeShift({ total_hours: 8 }), history).triggered).toBe(false);
  });

  it('does NOT trigger at exactly 1.4x average (boundary — not strictly greater)', () => {
    // avg = 8, threshold = 8 * 1.4 = 11.2, total_hours = 11.2 → NOT > 11.2
    const history = makeHistory([8, 8, 8, 8]);
    expect(checkRule005(makeShift({ total_hours: 11.2 }), history).triggered).toBe(false);
  });

  it('TRIGGERS when hours exceed 1.4x average with 4+ history shifts', () => {
    // avg = 8, threshold = 11.2, total_hours = 12 > 11.2
    const history = makeHistory([8, 8, 8, 8]);
    const result = checkRule005(makeShift({ total_hours: 12 }), history);
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_005');
    expect(result.flag?.severity).toBe('LOW');
  });

  it('TRIGGERS with 5 history shifts', () => {
    // avg = 6, threshold = 6 * 1.4 = 8.4, total_hours = 10 > 8.4
    const history = makeHistory([6, 6, 6, 6, 6]);
    const result = checkRule005(makeShift({ total_hours: 10 }), history);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('LOW');
  });

  it('flag explanation includes worker name, average hours, and submitted hours', () => {
    const history = makeHistory([8, 8, 8, 8]);
    const result = checkRule005(
      makeShift({ total_hours: 12, worker_first_name: 'Joao' }),
      history
    );
    expect(result.flag?.explanation).toContain('Joao');
    expect(result.flag?.explanation).toContain('8.0'); // avg
    expect(result.flag?.explanation).toContain('12.0'); // today
  });

  it('calculates correct percentage above average', () => {
    // avg = 8, total = 12, pct = (12-8)/8 * 100 = 50%
    const history = makeHistory([8, 8, 8, 8]);
    const result = checkRule005(makeShift({ total_hours: 12 }), history);
    expect(result.flag?.explanation).toContain('50%');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_006 — Late Submission (> 12 hrs after end) — LOW
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_006 — Late Submission', () => {
  it('does NOT trigger when end_time is null (shift in progress)', () => {
    const result = checkRule006(makeShift({ end_time: null }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when submitted immediately at shift end', () => {
    const end = new Date('2026-04-22T15:30:00Z');
    const result = checkRule006(makeShift({ end_time: end, submitted_at: end }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when submitted exactly 12 hours after end (boundary)', () => {
    const end = new Date('2026-04-22T15:30:00Z');
    const submitted = new Date(end.getTime() + 12 * 60 * 60 * 1000); // exactly 12h
    const result = checkRule006(makeShift({ end_time: end, submitted_at: submitted }));
    expect(result.triggered).toBe(false);
  });

  it('TRIGGERS when submitted just over 12 hours after end', () => {
    const end = new Date('2026-04-22T15:30:00Z');
    const submitted = new Date(end.getTime() + 12 * 60 * 60 * 1000 + 1); // 12h + 1ms
    const result = checkRule006(makeShift({ end_time: end, submitted_at: submitted }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_006');
    expect(result.flag?.severity).toBe('LOW');
  });

  it('TRIGGERS when submitted 24 hours after end', () => {
    const end = new Date('2026-04-22T15:30:00Z');
    const submitted = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const result = checkRule006(makeShift({ end_time: end, submitted_at: submitted }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('LOW');
  });

  it('flag explanation includes rounded hours late', () => {
    const end = new Date('2026-04-22T15:30:00Z');
    const submitted = new Date(end.getTime() + 24 * 60 * 60 * 1000); // 24h late
    const result = checkRule006(makeShift({ end_time: end, submitted_at: submitted }));
    expect(result.flag?.explanation).toContain('24');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_007 — Weekend Submission — LOW
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_007 — Weekend Submission', () => {
  it('does NOT trigger on Wednesday (Joao scenario)', () => {
    expect(checkRule007(makeShift({ shift_date: '2026-04-22' })).triggered).toBe(false);
  });

  it('does NOT trigger on Monday', () => {
    expect(checkRule007(makeShift({ shift_date: '2026-04-20' })).triggered).toBe(false);
  });

  it('does NOT trigger on Friday', () => {
    expect(checkRule007(makeShift({ shift_date: '2026-04-24' })).triggered).toBe(false);
  });

  it('TRIGGERS on Saturday', () => {
    const result = checkRule007(makeShift({ shift_date: SATURDAY_DATE }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_007');
    expect(result.flag?.severity).toBe('LOW');
  });

  it('TRIGGERS on Sunday', () => {
    const result = checkRule007(makeShift({ shift_date: SUNDAY_DATE }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('LOW');
  });

  it('Saturday flag explanation mentions Saturday', () => {
    const result = checkRule007(makeShift({ shift_date: SATURDAY_DATE }));
    expect(result.flag?.explanation).toContain('Saturday');
  });

  it('Sunday flag explanation mentions Sunday', () => {
    const result = checkRule007(makeShift({ shift_date: SUNDAY_DATE }));
    expect(result.flag?.explanation).toContain('Sunday');
  });

  it('flag includes worker name', () => {
    const result = checkRule007(makeShift({ shift_date: SATURDAY_DATE, worker_first_name: 'Joao' }));
    expect(result.flag?.explanation).toContain('Joao');
  });

  it('flag action mentions authorisation', () => {
    const result = checkRule007(makeShift({ shift_date: SATURDAY_DATE }));
    expect(result.flag?.action).toMatch(/authoris/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_008 — GPS Location Very Far (> 50km) — HIGH
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_008 — GPS Very Far From Site (> 50km)', () => {
  it('does NOT trigger when GPS not captured', () => {
    const result = checkRule008(makeShift({ gps_captured: false, gps_distance_from_site_metres: 60000 }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS distance is null', () => {
    const result = checkRule008(makeShift({ gps_captured: true, gps_distance_from_site_metres: null }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when distance is within 50km (49999m)', () => {
    const result = checkRule008(makeShift({ gps_captured: true, gps_distance_from_site_metres: 49999, gps_accuracy_metres: 10 }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger at exactly 50km boundary (50000m)', () => {
    const result = checkRule008(makeShift({ gps_captured: true, gps_distance_from_site_metres: 50000, gps_accuracy_metres: 10 }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when GPS accuracy >= 100m (unreliable)', () => {
    const result = checkRule008(makeShift({ gps_captured: true, gps_distance_from_site_metres: 60000, gps_accuracy_metres: 100 }));
    expect(result.triggered).toBe(false);
  });

  it('does NOT trigger when accuracy is null', () => {
    const result = checkRule008(makeShift({ gps_captured: true, gps_distance_from_site_metres: 60000, gps_accuracy_metres: null }));
    expect(result.triggered).toBe(false);
  });

  it('TRIGGERS when distance > 50km with good accuracy', () => {
    const result = checkRule008(makeShift({
      gps_captured: true,
      gps_distance_from_site_metres: 50001,
      gps_accuracy_metres: 10,
    }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_008');
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('TRIGGERS for 75km distance', () => {
    const result = checkRule008(makeShift({
      gps_captured: true,
      gps_distance_from_site_metres: 75000,
      gps_accuracy_metres: 15,
    }));
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('flag explanation includes km distance and site name', () => {
    const result = checkRule008(makeShift({
      worker_first_name: 'Joao',
      site_name: 'Parramatta Site A',
      gps_captured: true,
      gps_distance_from_site_metres: 75000,
      gps_accuracy_metres: 10,
    }));
    expect(result.flag?.explanation).toContain('75.0');
    expect(result.flag?.explanation).toContain('Parramatta Site A');
    expect(result.flag?.explanation).toContain('Joao');
  });

  it('flag action includes worker name', () => {
    const result = checkRule008(makeShift({
      worker_first_name: 'Maria',
      gps_captured: true,
      gps_distance_from_site_metres: 60000,
      gps_accuracy_metres: 5,
    }));
    expect(result.flag?.action).toContain('Maria');
  });

  it('runAllRules includes RULE_008 when triggered', () => {
    const shift = makeShift({
      gps_captured: true,
      gps_distance_from_site_metres: 60000,
      gps_accuracy_metres: 10,
    });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.ruleId === 'RULE_008')).toBe(true);
  });

  it('RULE_008 makes shift ineligible for bulk approval', () => {
    const shift = makeShift({
      gps_captured: true,
      gps_distance_from_site_metres: 60000,
      gps_accuracy_metres: 10,
    });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_009 — Rapid Approval Velocity (> 20 approvals in < 60s) — HIGH
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_009 — Rapid Approval Velocity', () => {
  it('does NOT trigger for 5 approvals in 30 seconds (low volume)', () => {
    const batch: ApprovalBatch = { approvalCount: 5, windowSeconds: 30 };
    expect(checkRule009(batch).triggered).toBe(false);
  });

  it('does NOT trigger for exactly 20 approvals in 30 seconds (boundary — not > 20)', () => {
    const batch: ApprovalBatch = { approvalCount: 20, windowSeconds: 30 };
    expect(checkRule009(batch).triggered).toBe(false);
  });

  it('does NOT trigger for 25 approvals in 60 seconds (boundary — not < 60)', () => {
    const batch: ApprovalBatch = { approvalCount: 25, windowSeconds: 60 };
    expect(checkRule009(batch).triggered).toBe(false);
  });

  it('does NOT trigger for 25 approvals in 120 seconds (reasonable pace)', () => {
    const batch: ApprovalBatch = { approvalCount: 25, windowSeconds: 120 };
    expect(checkRule009(batch).triggered).toBe(false);
  });

  it('TRIGGERS for 21 approvals in 59 seconds', () => {
    const batch: ApprovalBatch = { approvalCount: 21, windowSeconds: 59 };
    const result = checkRule009(batch);
    expect(result.triggered).toBe(true);
    expect(result.flag?.ruleId).toBe('RULE_009');
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('TRIGGERS for 50 approvals in 10 seconds', () => {
    const batch: ApprovalBatch = { approvalCount: 50, windowSeconds: 10 };
    const result = checkRule009(batch);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('HIGH');
  });

  it('flag explanation includes count and time window', () => {
    const batch: ApprovalBatch = { approvalCount: 30, windowSeconds: 15 };
    const result = checkRule009(batch);
    expect(result.flag?.explanation).toContain('30');
    expect(result.flag?.explanation).toContain('15');
  });

  it('flag action recommends review and revocation', () => {
    const batch: ApprovalBatch = { approvalCount: 25, windowSeconds: 20 };
    const result = checkRule009(batch);
    expect(result.flag?.action).toMatch(/review/i);
  });

  it('does NOT trigger for 1 approval in 1 second', () => {
    const batch: ApprovalBatch = { approvalCount: 1, windowSeconds: 1 };
    expect(checkRule009(batch).triggered).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeConfidenceScore
// GPS(0-40) + HOURS(0-30) + COMPLETENESS(0-20) + HISTORY(0-10)
// ─────────────────────────────────────────────────────────────────────────────
describe('computeConfidenceScore', () => {
  const base: ConfidenceInputs = {
    gps_captured: true,
    gps_distance_from_site_metres: 50,   // within 200m → GPS=40
    geofence_radius_metres: 200,
    total_hours: 8,                       // 4-10 range → HOURS=30
    end_time: new Date(),                 // has end → COMPLETENESS has break_minutes
    break_minutes: 30,                    // → COMPLETENESS=20
    history_shift_count: 4,              // > 3 shifts
    history_avg_hours: 8,               // within 25% of 8 → HISTORY=10
  };

  it('Joao scenario: GPS(40)+HOURS(30)+COMPLETENESS(20)+HISTORY(5 new worker) = 95', () => {
    const joaoInputs: ConfidenceInputs = {
      ...base,
      history_shift_count: 2, // new worker → HISTORY=5
    };
    expect(computeConfidenceScore(joaoInputs)).toBe(95);
  });

  it('perfect score: all conditions met with history = 100', () => {
    expect(computeConfidenceScore(base)).toBe(100);
  });

  // GPS_SCORE tests
  it('GPS: not captured → GPS=20', () => {
    const score = computeConfidenceScore({ ...base, gps_captured: false });
    expect(score).toBe(20 + 30 + 20 + 10); // 80
  });

  it('GPS: captured, null distance → GPS=20', () => {
    const score = computeConfidenceScore({ ...base, gps_distance_from_site_metres: null });
    expect(score).toBe(20 + 30 + 20 + 10); // 80
  });

  it('GPS: exactly at boundary (200m) → GPS=40', () => {
    const score = computeConfidenceScore({ ...base, gps_distance_from_site_metres: 200 });
    expect(score).toBe(40 + 30 + 20 + 10); // 100
  });

  it('GPS: between 1x and 2x radius (201-400m) → GPS=20', () => {
    const score = computeConfidenceScore({ ...base, gps_distance_from_site_metres: 300 });
    expect(score).toBe(20 + 30 + 20 + 10); // 80
  });

  it('GPS: exactly at 2x radius boundary (400m) → GPS=20', () => {
    const score = computeConfidenceScore({ ...base, gps_distance_from_site_metres: 400 });
    expect(score).toBe(20 + 30 + 20 + 10); // 80
  });

  it('GPS: beyond 2x radius (401m+) → GPS=5', () => {
    const score = computeConfidenceScore({ ...base, gps_distance_from_site_metres: 500 });
    expect(score).toBe(5 + 30 + 20 + 10); // 65
  });

  // HOURS_SCORE tests
  it('HOURS: 4 hrs (lower boundary of optimal) → HOURS=30; HISTORY=0 (4 is 50% below avg 8)', () => {
    // |4-8|/8 = 0.50 > 0.25 → HISTORY=0
    const score = computeConfidenceScore({ ...base, total_hours: 4 });
    expect(score).toBe(40 + 30 + 20 + 0); // 90
  });

  it('HOURS: 10 hrs (upper boundary of optimal) → HOURS=30', () => {
    const score = computeConfidenceScore({ ...base, total_hours: 10 });
    expect(score).toBe(40 + 30 + 20 + 10); // 100
  });

  it('HOURS: 3 hrs (2-4 range) → HOURS=15', () => {
    const score = computeConfidenceScore({ ...base, total_hours: 3, history_avg_hours: 3 });
    expect(score).toBe(40 + 15 + 20 + 10); // 85
  });

  it('HOURS: 11 hrs (10-12 range) → HOURS=15', () => {
    const score = computeConfidenceScore({ ...base, total_hours: 11, history_avg_hours: 11 });
    expect(score).toBe(40 + 15 + 20 + 10); // 85
  });

  it('HOURS: 0 hrs → HOURS=0; HISTORY also 0 (0 hrs is 100% below avg of 8)', () => {
    // |0-8|/8 = 1.0 > 0.25 → HISTORY=0 too
    const score = computeConfidenceScore({ ...base, total_hours: 0 });
    expect(score).toBe(40 + 0 + 20 + 0); // 60
  });

  it('HOURS: 14 hrs → HOURS=0; HISTORY also 0 (14 hrs is 75% above avg of 8)', () => {
    // |14-8|/8 = 0.75 > 0.25 → HISTORY=0
    const score = computeConfidenceScore({ ...base, total_hours: 14 });
    expect(score).toBe(40 + 0 + 20 + 0); // 60
  });

  // COMPLETENESS_SCORE tests
  it('COMPLETENESS: no end_time → 0', () => {
    const score = computeConfidenceScore({ ...base, end_time: null });
    expect(score).toBe(40 + 30 + 0 + 10); // 80
  });

  it('COMPLETENESS: end_time but null break_minutes → 10', () => {
    const score = computeConfidenceScore({ ...base, break_minutes: null });
    expect(score).toBe(40 + 30 + 10 + 10); // 90
  });

  it('COMPLETENESS: end_time + break_minutes → 20', () => {
    const score = computeConfidenceScore({ ...base, break_minutes: 30 });
    expect(score).toBe(40 + 30 + 20 + 10); // 100
  });

  // HISTORY_SCORE tests
  it('HISTORY: 0 shifts (new worker) → 5', () => {
    const score = computeConfidenceScore({ ...base, history_shift_count: 0 });
    expect(score).toBe(40 + 30 + 20 + 5); // 95
  });

  it('HISTORY: exactly 3 shifts → 5 (still new worker)', () => {
    const score = computeConfidenceScore({ ...base, history_shift_count: 3 });
    expect(score).toBe(40 + 30 + 20 + 5); // 95
  });

  it('HISTORY: 4 shifts, hours within 25% of avg → 10', () => {
    // 8 hrs, avg 8 hrs, within 0% → within 25%
    const score = computeConfidenceScore({ ...base, history_shift_count: 4, history_avg_hours: 8 });
    expect(score).toBe(40 + 30 + 20 + 10); // 100
  });

  it('HISTORY: 4 shifts, hours exactly 25% above avg (within boundary) → 10', () => {
    // 10 hrs total, avg 8, delta = 2/8 = 25% — within 25% check: Math.abs(10-8)/8 = 0.25 = 25%
    const score = computeConfidenceScore({ ...base, total_hours: 10, history_shift_count: 4, history_avg_hours: 8 });
    expect(score).toBe(40 + 30 + 20 + 10); // 100
  });

  it('HISTORY: 4 shifts, hours outside 25% of avg → 0', () => {
    // 12 hrs total, avg 8, delta = 4/8 = 50% > 25% → HISTORY=0
    // 12 hrs: 10 < 12 ≤ 12 → HOURS=15 (not 0)
    const score = computeConfidenceScore({ ...base, total_hours: 12, history_shift_count: 4, history_avg_hours: 8 });
    expect(score).toBe(40 + 15 + 20 + 0); // 75
  });

  it('HISTORY: > 3 shifts but null avg_hours → 0 (cannot confirm pattern)', () => {
    // history_shift_count=5 > 3, but avg=null → falls to else → HISTORY=0
    const score = computeConfidenceScore({ ...base, history_shift_count: 5, history_avg_hours: null });
    expect(score).toBe(40 + 30 + 20 + 0); // 90
  });

  // Total score clamping
  it('minimum possible score: GPS=5, HOURS=0, COMPLETENESS=0, HISTORY=0 = 5', () => {
    const score = computeConfidenceScore({
      gps_captured: true,
      gps_distance_from_site_metres: 1000,
      geofence_radius_metres: 200,
      total_hours: 0,
      end_time: null,
      break_minutes: null,
      history_shift_count: 10,
      history_avg_hours: 8,
    });
    expect(score).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runAllRules — integration
// ─────────────────────────────────────────────────────────────────────────────
describe('runAllRules — integration', () => {
  it('returns empty array for clean shift (Joao)', () => {
    const flags = runAllRules(makeShift(), GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags).toHaveLength(0);
  });

  it('returns RULE_001 flag for 13-hour shift', () => {
    const flags = runAllRules(makeShift({ total_hours: 13 }), GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.ruleId === 'RULE_001')).toBe(true);
  });

  it('returns RULE_004 flag for duplicate shift', () => {
    const flags = runAllRules(makeShift(), GEOFENCE_RADIUS, 1, NO_HISTORY);
    expect(flags.some(f => f.ruleId === 'RULE_004')).toBe(true);
  });

  it('returns RULE_007 flag for weekend shift', () => {
    const flags = runAllRules(makeShift({ shift_date: SATURDAY_DATE }), GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.ruleId === 'RULE_007')).toBe(true);
  });

  it('can return multiple flags simultaneously', () => {
    // Duplicate (HIGH) + Weekend (LOW) + Short hours (MEDIUM)
    const shift = makeShift({
      shift_date: SATURDAY_DATE,
      total_hours: 0.5,
    });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 1, NO_HISTORY);
    expect(flags.length).toBeGreaterThanOrEqual(3);
    expect(flags.some(f => f.ruleId === 'RULE_004')).toBe(true);
    expect(flags.some(f => f.ruleId === 'RULE_007')).toBe(true);
    expect(flags.some(f => f.ruleId === 'RULE_002')).toBe(true);
  });

  it('all returned flags have required fields: ruleId, severity, explanation, action', () => {
    const shift = makeShift({ total_hours: 14 });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 0, NO_HISTORY);
    for (const flag of flags) {
      expect(flag).toHaveProperty('ruleId');
      expect(flag).toHaveProperty('severity');
      expect(flag).toHaveProperty('explanation');
      expect(flag).toHaveProperty('action');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isEligibleForBulkApproval — YES ALL gate
// Non-negotiable: only approves shifts with NO HIGH or MEDIUM flags
// ─────────────────────────────────────────────────────────────────────────────
describe('isEligibleForBulkApproval — YES ALL gate', () => {
  it('returns true for empty flags array', () => {
    expect(isEligibleForBulkApproval([])).toBe(true);
  });

  it('returns true when only LOW flags present', () => {
    const flags = runAllRules(makeShift({ shift_date: SATURDAY_DATE }), GEOFENCE_RADIUS, 0, NO_HISTORY);
    // Should only have RULE_007 (LOW)
    expect(flags.every(f => f.severity === 'LOW')).toBe(true);
    expect(isEligibleForBulkApproval(flags)).toBe(true);
  });

  it('returns false when HIGH flag present', () => {
    const flags = runAllRules(makeShift({ total_hours: 13 }), GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.severity === 'HIGH')).toBe(true);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });

  it('returns false when MEDIUM flag present', () => {
    const flags = runAllRules(makeShift({ total_hours: 1 }), GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.severity === 'MEDIUM')).toBe(true);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });

  it('returns false when DUPLICATE (HIGH) flag present — can never bulk approve duplicates', () => {
    const flags = runAllRules(makeShift(), GEOFENCE_RADIUS, 1, NO_HISTORY);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });

  it('returns false for mixed LOW + HIGH', () => {
    const shift = makeShift({ shift_date: SATURDAY_DATE, total_hours: 14 });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.severity === 'HIGH')).toBe(true);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });

  it('returns false for mixed LOW + MEDIUM', () => {
    const shift = makeShift({ shift_date: SATURDAY_DATE, total_hours: 1 });
    const flags = runAllRules(shift, GEOFENCE_RADIUS, 0, NO_HISTORY);
    expect(flags.some(f => f.severity === 'MEDIUM')).toBe(true);
    expect(isEligibleForBulkApproval(flags)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// confidenceLabel
// ─────────────────────────────────────────────────────────────────────────────
describe('confidenceLabel', () => {
  it('score 100 → HIGH confidence, green', () => {
    const { label, colour } = confidenceLabel(100);
    expect(colour).toBe('green');
    expect(label).toMatch(/high/i);
  });

  it('score 70 → HIGH confidence, green (lower boundary)', () => {
    const { colour } = confidenceLabel(70);
    expect(colour).toBe('green');
  });

  it('score 69 → MEDIUM confidence, amber', () => {
    const { colour } = confidenceLabel(69);
    expect(colour).toBe('amber');
  });

  it('score 40 → MEDIUM confidence, amber (lower boundary)', () => {
    const { colour } = confidenceLabel(40);
    expect(colour).toBe('amber');
  });

  it('score 39 → LOW confidence, red', () => {
    const { colour } = confidenceLabel(39);
    expect(colour).toBe('red');
  });

  it('score 0 → LOW confidence, red', () => {
    const { colour } = confidenceLabel(0);
    expect(colour).toBe('red');
  });

  it('red label mentions review recommended', () => {
    const { label } = confidenceLabel(0);
    expect(label).toMatch(/review/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_010 — Public Holiday Submission (added 2026-04-30 per
// labour-hire-workflow-gap-analysis-2026-04-29 §2.G6)
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_010 — Public Holiday Submission', () => {
  it('does not fire on the canonical Joao date (Wed 22 April 2026)', () => {
    const shift = makeShift();
    expect(checkRule010(shift).triggered).toBe(false);
  });

  it('fires on Christmas Day 2026', () => {
    const shift = makeShift({ shift_date: '2026-12-25' });
    const result = checkRule010(shift);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('LOW');
    expect(result.flag?.ruleId).toBe('RULE_010');
  });

  it('fires on ANZAC Day 2026', () => {
    const shift = makeShift({ shift_date: '2026-04-25' });
    const result = checkRule010(shift);
    expect(result.triggered).toBe(true);
  });

  it('action text mentions authorisation', () => {
    const shift = makeShift({ shift_date: '2026-12-25' });
    const result = checkRule010(shift);
    expect(result.flag?.action).toMatch(/authoris/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_011 — Outside Ordinary Span (added 2026-04-30 per
// labour-hire-workflow-gap-analysis-2026-04-29 §2.G7)
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_011 — Outside Ordinary Span', () => {
  it('does not fire on the canonical Joao shift (07:00–15:30 AEST)', () => {
    const shift = makeShift();
    expect(checkRule011(shift).triggered).toBe(false);
  });

  it('fires on a 4am start (before 06:00 AEST)', () => {
    const shift = makeShift({
      start_time: new Date('2026-04-22T04:00:00+10:00'),
      end_time: new Date('2026-04-22T12:30:00+10:00'),
    });
    const result = checkRule011(shift);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('LOW');
    expect(result.flag?.ruleId).toBe('RULE_011');
    expect(result.flag?.explanation).toMatch(/before/i);
  });

  it('fires on a 7pm end (after 18:00 AEST)', () => {
    const shift = makeShift({
      start_time: new Date('2026-04-22T10:00:00+10:00'),
      end_time: new Date('2026-04-22T19:00:00+10:00'),
    });
    const result = checkRule011(shift);
    expect(result.triggered).toBe(true);
    expect(result.flag?.explanation).toMatch(/(finished|after)/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE_012 — Daily Cumulative Hours (added 2026-04-30 per
// labour-hire-workflow-gap-analysis-2026-04-29 §2.G7)
// ─────────────────────────────────────────────────────────────────────────────
describe('RULE_012 — Daily Cumulative Hours', () => {
  it('does not fire when the canonical 8h Joao shift is the only shift of the day', () => {
    const shift = makeShift();
    expect(checkRule012(shift, 0).triggered).toBe(false);
  });

  it('does not fire at exactly 10 cumulative hours', () => {
    const shift = makeShift({ total_hours: 4 });
    // 6 from earlier + 4 from this = 10. Threshold is > 10, not >=.
    expect(checkRule012(shift, 6).triggered).toBe(false);
  });

  it('fires above 10 cumulative hours', () => {
    const shift = makeShift({ total_hours: 5 });
    const result = checkRule012(shift, 6);
    expect(result.triggered).toBe(true);
    expect(result.flag?.severity).toBe('MEDIUM');
    expect(result.flag?.ruleId).toBe('RULE_012');
    expect(result.flag?.explanation).toMatch(/11\.0/);
  });

  it('fires when one long shift alone exceeds the threshold', () => {
    const shift = makeShift({ total_hours: 11 });
    const result = checkRule012(shift, 0);
    expect(result.triggered).toBe(true);
  });
});
