// Flostruction Intelligence — Rules Engine
// Non-negotiable: NEVER blocks submissions. All flags are informational only.
// Sprint 2 D1: 7 named rules per spec, Australian English explanations with worker first name.

export type FlagSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AnomalyFlag {
  ruleId: string;
  severity: FlagSeverity;
  explanation: string;
  action: string;
}

export interface ShiftForRules {
  id: string;
  worker_first_name: string;
  site_name: string;
  shift_date: string;        // YYYY-MM-DD
  start_time: Date;
  end_time: Date | null;
  break_minutes: number;
  total_hours: number;
  submitted_at: Date;
  gps_captured: boolean;
  gps_distance_from_site_metres: number | null;
  gps_accuracy_metres: number | null;
  worker_id: string;
  company_id: string;
  site_id: string;
}

export interface WorkerHistory {
  shifts: Array<{ total_hours: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_001: Hours Too Long (> 12 hrs) — HIGH
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule001(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  if (shift.total_hours > 12) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_001',
        severity: 'HIGH',
        explanation: `${shift.worker_first_name} submitted ${shift.total_hours.toFixed(1)} hours. Shifts over 12 hours are unusual for this site and may indicate a timesheet error.`,
        action: `Check with ${shift.worker_first_name} and adjust if needed.`,
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_002: Hours Very Short (< 2 hrs) — MEDIUM
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule002(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  if (shift.total_hours < 2) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_002',
        severity: 'MEDIUM',
        explanation: `${shift.worker_first_name} submitted ${shift.total_hours.toFixed(1)} hours. This is a very short shift. Confirm this is correct.`,
        action: 'Confirm shift was completed as submitted.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_003: GPS Outside Geofence — MEDIUM
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule003(
  shift: ShiftForRules,
  geofenceRadiusMetres: number
): { triggered: boolean; flag?: AnomalyFlag } {
  if (
    shift.gps_captured &&
    shift.gps_distance_from_site_metres !== null &&
    shift.gps_distance_from_site_metres > geofenceRadiusMetres &&
    shift.gps_accuracy_metres !== null &&
    shift.gps_accuracy_metres < 100
  ) {
    const distance = Math.round(shift.gps_distance_from_site_metres);
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_003',
        severity: 'MEDIUM',
        explanation: `${shift.worker_first_name}'s phone location at submission was ${distance} metres from ${shift.site_name}. The shift was submitted from outside the expected area.`,
        action: `Ask ${shift.worker_first_name} to confirm they were at the correct site.`,
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_004: Duplicate Shift (same worker + date) — HIGH
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule004(
  shift: ShiftForRules,
  existingShiftCount: number
): { triggered: boolean; flag?: AnomalyFlag } {
  if (existingShiftCount > 0) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_004',
        severity: 'HIGH',
        explanation: `${shift.worker_first_name} already has a timesheet for ${formatDate(shift.shift_date)}. This appears to be a duplicate.`,
        action: 'Review both timesheets. Reject the incorrect one.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_005: Hours Significantly Above Average (> avg * 1.4) — LOW
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule005(
  shift: ShiftForRules,
  history: WorkerHistory
): { triggered: boolean; flag?: AnomalyFlag } {
  if (history.shifts.length <= 3) return { triggered: false };

  const avg =
    history.shifts.reduce((sum, s) => sum + s.total_hours, 0) / history.shifts.length;

  if (shift.total_hours > avg * 1.4) {
    const pctAbove = Math.round(((shift.total_hours - avg) / avg) * 100);
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_005',
        severity: 'LOW',
        explanation: `${shift.worker_first_name}'s usual shift is around ${avg.toFixed(1)} hours. Today's submission of ${shift.total_hours.toFixed(1)} hours is ${pctAbove}% above their typical day.`,
        action: 'No action required if expected. Review if unexpected.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_006: Late Submission (> 12 hrs after end_time) — LOW
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule006(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  if (!shift.end_time) return { triggered: false };

  const hoursLate =
    (shift.submitted_at.getTime() - shift.end_time.getTime()) / (1000 * 60 * 60);

  if (hoursLate > 12) {
    const hoursLateRounded = Math.round(hoursLate);
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_006',
        severity: 'LOW',
        explanation: `This timesheet was submitted ${hoursLateRounded} hours after the shift ended. Late submissions can sometimes indicate corrections or disputes.`,
        action: 'Review if needed. No action required for catch-up submissions.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_007: Weekend Submission — LOW
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule007(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  // Parse date components directly to avoid timezone drift across environments
  const [y, m, d] = shift.shift_date.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0 = Sunday, 6 = Saturday

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const dayName = dayOfWeek === 6 ? 'Saturday' : 'Sunday';
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_007',
        severity: 'LOW',
        explanation: `${shift.worker_first_name} submitted a timesheet for ${dayName}. Confirm weekend work was authorised.`,
        action: 'Confirm weekend work was authorised.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_008: GPS Location Very Far From Site (> 50km) — HIGH
// Fires when worker's phone GPS is more than 50,000 metres from the assigned site.
// ─────────────────────────────────────────────────────────────────────────────
export function checkRule008(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  if (
    shift.gps_captured &&
    shift.gps_distance_from_site_metres !== null &&
    shift.gps_distance_from_site_metres > 50000 &&
    shift.gps_accuracy_metres !== null &&
    shift.gps_accuracy_metres < 100
  ) {
    const distKm = (shift.gps_distance_from_site_metres / 1000).toFixed(1);
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_008',
        severity: 'HIGH',
        explanation: `${shift.worker_first_name}'s phone location at submission was ${distKm} km from ${shift.site_name}. This is well outside the expected area and may indicate the shift was not performed at this site.`,
        action: `Verify with ${shift.worker_first_name} that they were at the correct site. Do not approve until confirmed.`,
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_009: Rapid Approval Velocity (> 20 approvals in < 60 seconds) — HIGH
// Detects automated or bot-like approval behaviour from a supervisor.
// ─────────────────────────────────────────────────────────────────────────────
export interface ApprovalBatch {
  approvalCount: number;
  windowSeconds: number;
}

export function checkRule009(batch: ApprovalBatch): { triggered: boolean; flag?: AnomalyFlag } {
  if (batch.approvalCount > 20 && batch.windowSeconds < 60) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_009',
        severity: 'HIGH',
        explanation: `${batch.approvalCount} shifts were approved in ${batch.windowSeconds} seconds. This is unusually fast and may indicate automated or unreviewed approvals.`,
        action: 'Review all approvals in this batch. Consider revoking and requiring individual review.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence Score (0–100)
// GPS_SCORE (0-40) + HOURS_SCORE (0-30) + COMPLETENESS_SCORE (0-20) + HISTORY_SCORE (0-10)
// ─────────────────────────────────────────────────────────────────────────────
export interface ConfidenceInputs {
  gps_captured: boolean;
  gps_distance_from_site_metres: number | null;
  geofence_radius_metres: number;
  total_hours: number;
  end_time: Date | null;
  break_minutes: number | null;
  history_shift_count: number;
  history_avg_hours: number | null;
}

export function computeConfidenceScore(inputs: ConfidenceInputs): number {
  // GPS_SCORE (0-40)
  let gpsScore: number;
  if (!inputs.gps_captured) {
    gpsScore = 20; // neutral — not penalised
  } else if (inputs.gps_distance_from_site_metres === null) {
    gpsScore = 20;
  } else if (inputs.gps_distance_from_site_metres <= inputs.geofence_radius_metres) {
    gpsScore = 40;
  } else if (inputs.gps_distance_from_site_metres <= inputs.geofence_radius_metres * 2) {
    gpsScore = 20;
  } else {
    gpsScore = 5;
  }

  // HOURS_SCORE (0-30)
  let hoursScore: number;
  if (inputs.total_hours >= 4 && inputs.total_hours <= 10) {
    hoursScore = 30;
  } else if (
    (inputs.total_hours > 10 && inputs.total_hours <= 12) ||
    (inputs.total_hours >= 2 && inputs.total_hours < 4)
  ) {
    hoursScore = 15;
  } else {
    hoursScore = 0;
  }

  // COMPLETENESS_SCORE (0-20)
  let completenessScore: number;
  if (!inputs.end_time) {
    completenessScore = 0;
  } else if (inputs.break_minutes === null) {
    completenessScore = 10;
  } else {
    completenessScore = 20;
  }

  // HISTORY_SCORE (0-10)
  let historyScore: number;
  if (inputs.history_shift_count <= 3) {
    historyScore = 5; // new worker — neutral
  } else if (
    inputs.history_avg_hours !== null &&
    Math.abs(inputs.total_hours - inputs.history_avg_hours) / inputs.history_avg_hours <= 0.25
  ) {
    historyScore = 10;
  } else {
    historyScore = 0;
  }

  return gpsScore + hoursScore + completenessScore + historyScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_010: Public Holiday Submission — LOW
// Fires when shift_date matches a state public holiday for the worker's
// state. Hardcoded list for ACT/NSW/VIC/QLD across 2026 and 2027 added
// 2026-04-30 per labour-hire-workflow-gap-analysis-2026-04-29 §2.G6
// (Tier 1 fix). Annual maintenance burden: list extends to 2028+ before
// 2027-12-01.
// ─────────────────────────────────────────────────────────────────────────────

// State of the worker's primary site is not currently captured in
// ShiftForRules. For the Tier 1 fix the rule fires on any date that is
// a public holiday in *any* of the four states — over-flags slightly
// in cross-state edge cases, under-flags zero. Severity is LOW so
// over-flagging surfaces but does not block. Sites table can carry a
// state column in a future Tier 2 enhancement to scope the check.
export const AU_PUBLIC_HOLIDAYS_2026_2027: ReadonlySet<string> = new Set([
  // 2026 — national + ACT/NSW/VIC/QLD where they differ.
  '2026-01-01', // New Year's Day (national)
  '2026-01-26', // Australia Day (national)
  '2026-03-09', // Canberra Day ACT / Labour Day VIC
  '2026-04-03', // Good Friday (national)
  '2026-04-04', // Easter Saturday (most states)
  '2026-04-05', // Easter Sunday (most states)
  '2026-04-06', // Easter Monday (national)
  '2026-04-25', // ANZAC Day (national; Saturday in 2026)
  '2026-05-04', // Labour Day QLD
  '2026-06-08', // King's Birthday ACT/NSW/VIC/QLD-equivalent (Mon in June)
  '2026-08-03', // Picnic Day NT / Bank Holiday NSW
  '2026-09-28', // King's Birthday WA / Family & Community Day ACT alt
  '2026-10-05', // Labour Day ACT/NSW
  '2026-12-25', // Christmas Day (national)
  '2026-12-26', // Boxing Day (national)
  '2026-12-28', // Boxing Day observed (Mon, since 26 falls Sat)

  // 2027 — provisional, subject to state-government confirmation
  '2027-01-01',
  '2027-01-26',
  '2027-03-08', // Canberra Day ACT / Labour Day VIC
  '2027-03-26', // Good Friday
  '2027-03-27',
  '2027-03-28',
  '2027-03-29', // Easter Monday
  '2027-04-26', // ANZAC Day observed (Mon, since 25 falls Sun)
  '2027-05-03', // Labour Day QLD
  '2027-06-14', // King's Birthday
  '2027-10-04', // Labour Day ACT/NSW
  '2027-12-25',
  '2027-12-26',
  '2027-12-27', // Christmas observed (Mon, since 25 falls Sat)
  '2027-12-28', // Boxing Day observed (Tue)
]);

export function checkRule010(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  if (AU_PUBLIC_HOLIDAYS_2026_2027.has(shift.shift_date)) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_010',
        severity: 'LOW',
        explanation: `${shift.worker_first_name} submitted a timesheet for ${formatDate(shift.shift_date)}, a public holiday. Confirm public holiday work was authorised and that any award entitlements are recorded downstream in payroll.`,
        action: 'Confirm public holiday authorisation; ensure penalty rates apply downstream.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_011: Outside Ordinary Span — LOW
// Fires when the shift's start or end falls outside the configured
// "ordinary span" (default 06:00–18:00 AEST). Most Australian
// labour-hire awards apply penalty rates to work outside this span;
// the substrate captures the fact, downstream payroll computes the
// rate. Hardcoded span at the Tier 1 level — companies.ordinary_span_*
// columns are a Tier 2 future enhancement.
// Reference: labour-hire-workflow-gap-analysis-2026-04-29 §2.G7.
// Note: AU public-holiday awards typically vary span; this rule does
// not attempt that interaction — RULE_010 fires separately on those
// days.
// ─────────────────────────────────────────────────────────────────────────────
export const ORDINARY_SPAN_START_HOUR_AEST = 6;
export const ORDINARY_SPAN_END_HOUR_AEST = 18;

export function checkRule011(shift: ShiftForRules): { triggered: boolean; flag?: AnomalyFlag } {
  // Convert UTC start/end into AEST hour-of-day. AEST is UTC+10
  // year-round (Australia outside DST jurisdictions); this is a
  // conservative simplification — Sydney/Melbourne would shift +1 in
  // AEDT but the 1-hour drift only affects edge-of-span shifts and
  // is acceptable for a LOW-severity flag. Refine to per-site
  // tz-database lookup in a future enhancement.
  const aestOffset = 10 * 60 * 60 * 1000;
  const startAEST = new Date(shift.start_time.getTime() + aestOffset);
  const endAEST = shift.end_time
    ? new Date(shift.end_time.getTime() + aestOffset)
    : null;

  const startHour = startAEST.getUTCHours();
  const endHour = endAEST?.getUTCHours() ?? null;

  const startsOutside = startHour < ORDINARY_SPAN_START_HOUR_AEST;
  const endsOutside = endHour !== null && endHour >= ORDINARY_SPAN_END_HOUR_AEST;

  if (startsOutside || endsOutside) {
    const reasons: string[] = [];
    if (startsOutside) {
      reasons.push(`started before ${String(ORDINARY_SPAN_START_HOUR_AEST).padStart(2, '0')}:00`);
    }
    if (endsOutside) {
      reasons.push(`finished at or after ${String(ORDINARY_SPAN_END_HOUR_AEST).padStart(2, '0')}:00`);
    }
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_011',
        severity: 'LOW',
        explanation: `${shift.worker_first_name}'s shift ${reasons.join(' and ')} AEST. Confirm work outside the ordinary span (06:00–18:00) was authorised and that any award penalty rates apply downstream.`,
        action: 'Confirm authorisation of work outside ordinary span.',
      },
    };
  }

  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE_012: Daily Cumulative Hours — MEDIUM
// Fires when a worker's cumulative hours across all SUBMITTED-or-later
// shifts on the same shift_date exceed a threshold (default 10 hours).
// Distinguishes "this single shift" from "this person worked a long
// day across multiple bookings". Severity MEDIUM (not HIGH) because
// long days are sometimes legitimate (overtime authorised, double
// shift requested) — supervisors confirm; system flags.
// Reference: labour-hire-workflow-gap-analysis-2026-04-29 §2.G7.
// ─────────────────────────────────────────────────────────────────────────────
export const DAILY_CUMULATIVE_HOURS_THRESHOLD = 10;

export function checkRule012(
  shift: ShiftForRules,
  sameDayHoursExcludingThis: number,
): { triggered: boolean; flag?: AnomalyFlag } {
  const cumulative = sameDayHoursExcludingThis + shift.total_hours;
  if (cumulative > DAILY_CUMULATIVE_HOURS_THRESHOLD) {
    const cumulativeStr = cumulative.toFixed(1);
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_012',
        severity: 'MEDIUM',
        explanation: `${shift.worker_first_name} has ${cumulativeStr} cumulative hours on ${formatDate(shift.shift_date)} across all shifts. This exceeds the ${DAILY_CUMULATIVE_HOURS_THRESHOLD}-hour daily threshold. Confirm the additional hours are authorised and review for fatigue management.`,
        action: 'Confirm authorised; review for fatigue.',
      },
    };
  }
  return { triggered: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run All Rules
// ─────────────────────────────────────────────────────────────────────────────
export function runAllRules(
  shift: ShiftForRules,
  geofenceRadiusMetres: number,
  existingShiftCount: number,
  history: WorkerHistory,
  sameDayHoursExcludingThis: number = 0,
): AnomalyFlag[] {
  const results = [
    checkRule001(shift),
    checkRule002(shift),
    checkRule003(shift, geofenceRadiusMetres),
    checkRule004(shift, existingShiftCount),
    checkRule005(shift, history),
    checkRule006(shift),
    checkRule007(shift),
    checkRule008(shift),
    checkRule010(shift),
    checkRule011(shift),
    checkRule012(shift, sameDayHoursExcludingThis),
  ];

  return results
    .filter((r) => r.triggered && r.flag !== undefined)
    .map((r) => r.flag as AnomalyFlag);
}

// YES ALL gate: only eligible if no HIGH or MEDIUM flags
// Non-negotiable per CLAUDE.md rule 14
export function isEligibleForBulkApproval(flags: AnomalyFlag[]): boolean {
  return !flags.some((f) => f.severity === 'HIGH' || f.severity === 'MEDIUM');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00+10:00');
  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  });
}

// Confidence label for display (never show raw score to non-admin users)
export function confidenceLabel(score: number): { label: string; colour: 'green' | 'amber' | 'red' } {
  if (score >= 70) return { label: 'HIGH confidence', colour: 'green' };
  if (score >= 40) return { label: 'MEDIUM confidence', colour: 'amber' };
  return { label: 'LOW confidence — review recommended', colour: 'red' };
}
