// L2.1 chunk 3 — Worker / supervisor collusion-detection INTELLIGENCE rules
//
// Promoted from Phase 1.5 to P1 per the L2.1 worker-protection
// promotion. Four rules:
//
//   RULE_010 — SUSPECT_GPS_PRECISION (LOW)
//     gps_accuracy_metres < 5 AND no mock_location flag.
//     Civilian GPS rarely beats 5m; either spoofed or a sensor that
//     should be sanity-checked.
//
//   RULE_011 — RUBBER_STAMP_RISK (MEDIUM)
//     Supervisor approved <=5 seconds after the SMS was sent AND
//     the batch contained >=3 shifts. Distinguishes "considered
//     approval" from "tap-tap-tap auto-clear".
//
//   RULE_012 — IMPOSSIBLE_LOCATION_CHANGE (HIGH)
//     Worker has another sealed CLOCK_IN within the last 30 minutes
//     whose site is >5 km from the current site.
//
//   RULE_013 — COLLUSION_CANDIDATE (HIGH, cron-evaluated)
//     A (worker_id, supervisor_id) pair has 100% approval rate AND
//     >20 shifts in the last 30 days AND any of (010|011|012) was
//     flagged for the pair this period. Escalates to FLOSMOSIS.
//
// Same authoring contract as the rest of the rules engine: NEVER
// blocks. All flags are informational. 010/011/012 evaluate
// synchronously where the relevant event seals; 013 evaluates
// nightly via /api/cron/intelligence-collusion-pairs.

import type { AnomalyFlag } from './rules';

// ─── Pure rule evaluators ──────────────────────────────────────────

export interface Rule010Input {
  worker_first_name: string;
  gps_accuracy_metres: number | null;
  // Set true if the worker's device reported mock_location (some
  // Android settings expose this). Null = unknown.
  mock_location_reported: boolean | null;
}

export function checkRule010(
  input: Rule010Input,
): { triggered: boolean; flag?: AnomalyFlag } {
  if (
    input.gps_accuracy_metres !== null &&
    input.gps_accuracy_metres < 5 &&
    !input.mock_location_reported
  ) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_010',
        severity: 'LOW',
        explanation: `${input.worker_first_name}'s phone reported a GPS accuracy of ${input.gps_accuracy_metres.toFixed(1)} metres — finer than civilian GPS usually delivers. Worth a sanity check on the device.`,
        action: `Confirm with ${input.worker_first_name} that they are not using a mock-location app.`,
      },
    };
  }
  return { triggered: false };
}

export interface Rule011Input {
  supervisor_first_name: string;
  approval_count_in_batch: number;
  // Seconds elapsed between the supervisor SMS being sent and the
  // approval reply being received.
  reply_latency_seconds: number;
}

export function checkRule011(
  input: Rule011Input,
): { triggered: boolean; flag?: AnomalyFlag } {
  if (
    input.reply_latency_seconds <= 5 &&
    input.approval_count_in_batch >= 3
  ) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_011',
        severity: 'MEDIUM',
        explanation: `${input.supervisor_first_name} approved ${input.approval_count_in_batch} shifts within ${input.reply_latency_seconds} seconds of receiving the SMS. That's faster than is typically physically possible to read each shift.`,
        action: `Review the approved shifts individually. If correct, no action needed — but consider asking ${input.supervisor_first_name} to slow down on batch approvals.`,
      },
    };
  }
  return { triggered: false };
}

export interface Rule012Input {
  worker_first_name: string;
  current_site_name: string;
  // The most recent OTHER CLOCK_IN sealed for this worker within the
  // last 30 minutes whose site is >5km away. Null = no such event.
  conflicting: {
    site_name: string;
    distance_km: number;
    minutes_ago: number;
  } | null;
}

export function checkRule012(
  input: Rule012Input,
): { triggered: boolean; flag?: AnomalyFlag } {
  if (input.conflicting && input.conflicting.distance_km > 5) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_012',
        severity: 'HIGH',
        explanation: `${input.worker_first_name} clocked in at ${input.current_site_name}, but ${input.conflicting.minutes_ago} minutes ago they also clocked in at ${input.conflicting.site_name} — ${input.conflicting.distance_km.toFixed(1)} km away. They cannot have been at both sites.`,
        action: `Check with ${input.worker_first_name} which site they are actually working at. One of the two clock-ins is wrong and may indicate someone clocking in on their behalf.`,
      },
    };
  }
  return { triggered: false };
}

export interface Rule013Input {
  worker_first_name: string;
  supervisor_first_name: string;
  shifts_in_period: number;
  approval_rate_pct: number; // 0-100
  triggering_rule_ids: string[]; // any of RULE_010/011/012 raised for this pair
}

export function checkRule013(
  input: Rule013Input,
): { triggered: boolean; flag?: AnomalyFlag } {
  if (
    input.approval_rate_pct >= 100 &&
    input.shifts_in_period > 20 &&
    input.triggering_rule_ids.length > 0
  ) {
    return {
      triggered: true,
      flag: {
        ruleId: 'RULE_013',
        severity: 'HIGH',
        explanation: `${input.worker_first_name} and supervisor ${input.supervisor_first_name} have a 100% approval rate over ${input.shifts_in_period} shifts in the last 30 days. The pair has also raised: ${input.triggering_rule_ids.join(', ')}. The combination is consistent with collusion and warrants direct review by FLOSMOSIS.`,
        action: 'FLOSMOSIS support has been notified. Do not approve further shifts for this pair until reviewed.',
      },
    };
  }
  return { triggered: false };
}

// ─── Aggregate runners ─────────────────────────────────────────────

/**
 * Run all SYNC collusion rules (010, 011, 012). Each input is
 * independent — caller passes whichever inputs are populated for the
 * current event:
 *   - On CLOCK_IN seal: rule010Input + rule012Input
 *   - On supervisor approval: rule011Input
 *   - All-three on a SHIFT_COMMIT may also pass all three.
 */
export function runSyncCollusionRules(input: {
  rule010?: Rule010Input;
  rule011?: Rule011Input;
  rule012?: Rule012Input;
}): AnomalyFlag[] {
  const out: AnomalyFlag[] = [];
  if (input.rule010) {
    const r = checkRule010(input.rule010);
    if (r.triggered && r.flag) out.push(r.flag);
  }
  if (input.rule011) {
    const r = checkRule011(input.rule011);
    if (r.triggered && r.flag) out.push(r.flag);
  }
  if (input.rule012) {
    const r = checkRule012(input.rule012);
    if (r.triggered && r.flag) out.push(r.flag);
  }
  return out;
}

// ─── Helpers ───────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two lat/lng points in metres. Pulled
 * here as a duplicate of the analyse.ts helper so this module is
 * self-contained for the cron route.
 */
export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
