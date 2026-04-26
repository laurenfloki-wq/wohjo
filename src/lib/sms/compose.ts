// Flostruction — SMS Message Composition
// Composes batch SMS messages per Sprint 3 spec.
// SMS copy rules:
//  - Worker name: First Last (full name)
//  - Hours: one decimal place (8.5hrs not 8.50hrs)
//  - Code: LAST 6 CHARS of receipt_id (FSTR-ABC123 → code is 'ABC123')
//  - REVIEW flag: one plain-English sentence from highest-severity anomaly
//  - Backup URL only shown when flagged shifts exist
//  - verify_token is stored on supervisors table, rotated weekly

import type { AnomalyFlag } from '@/lib/intelligence/rules';

export interface ShiftForSMS {
  receiptId: string;
  workerFirstName: string;
  workerLastName: string;
  totalHours: number;
  siteName: string;
  anomalyFlags: AnomalyFlag[];
}

/**
 * Extract the 6-char approval code from a receipt_id.
 * e.g., FSTR-ABC123 → ABC123
 */
export function extractCode(receiptId: string): string {
  return receiptId.slice(-6);
}

/**
 * Check if a shift has HIGH or MEDIUM anomaly flags.
 */
function isFlagged(shift: ShiftForSMS): boolean {
  return shift.anomalyFlags.some(
    (f) => f.severity === 'HIGH' || f.severity === 'MEDIUM'
  );
}

/**
 * Get plain-English review note from highest-severity flag.
 * Returns the explanation truncated for SMS readability.
 */
function getReviewNote(shift: ShiftForSMS): string {
  // Priority: HIGH > MEDIUM
  const highFlag = shift.anomalyFlags.find((f) => f.severity === 'HIGH');
  const flag = highFlag ?? shift.anomalyFlags.find((f) => f.severity === 'MEDIUM');
  if (!flag) return '';

  // Extract a concise review note from the explanation
  // e.g., "Joao submitted 14.5 hours..." → "14.5hrs claimed - usual shift is ~9hrs"
  const hours = shift.totalHours.toFixed(1);
  if (flag.ruleId === 'RULE_001') {
    return `${hours}hrs claimed - usual shift is under 12hrs`;
  }
  if (flag.ruleId === 'RULE_002') {
    return `Only ${hours}hrs claimed - very short shift`;
  }
  if (flag.ruleId === 'RULE_003') {
    return 'GPS location outside expected site area';
  }
  if (flag.ruleId === 'RULE_004') {
    return 'Duplicate timesheet for this date';
  }
  // Fallback: use first sentence of explanation
  const firstSentence = flag.explanation.split('.')[0];
  return firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence;
}

/**
 * Format a single shift line for SMS.
 * Clean:   "Joao Silva - 8hrs Barangaroo ABC123"
 * Flagged: "Joao Silva - 8hrs Barangaroo ABC123 REVIEW: 14.5hrs claimed..."
 */
function formatShiftLine(shift: ShiftForSMS): string {
  const name = `${shift.workerFirstName} ${shift.workerLastName}`;
  const hours = `${parseFloat(shift.totalHours.toFixed(1))}hrs`;
  const code = extractCode(shift.receiptId);
  const base = `${name} - ${hours} ${shift.siteName} ${code}`;

  if (isFlagged(shift)) {
    const reviewNote = getReviewNote(shift);
    return `${base} REVIEW: ${reviewNote}`;
  }
  return base;
}

export interface ComposeBatchSMSParams {
  shifts: ShiftForSMS[];
  backupUrl: string; // e.g., https://flosmosis.com/v/[verify_token]
}

/**
 * Compose a batch SMS message for a supervisor.
 * Returns the message body per spec format.
 */
export function composeBatchSMS(params: ComposeBatchSMSParams): string {
  const { shifts, backupUrl } = params;
  const cleanShifts = shifts.filter((s) => !isFlagged(s));
  const flaggedShifts = shifts.filter((s) => isFlagged(s));
  const totalCount = shifts.length;

  const lines: string[] = [];

  if (flaggedShifts.length === 0) {
    // All clean
    lines.push(`Flostruction: ${totalCount} timesheet(s) from your crew.`);
    for (const shift of shifts) {
      lines.push(formatShiftLine(shift));
    }
    lines.push('Reply YES ALL to approve.');
  } else if (cleanShifts.length === 0) {
    // All flagged
    lines.push(`Flostruction: ${totalCount} timesheet(s) need your review.`);
    for (const shift of flaggedShifts) {
      lines.push(formatShiftLine(shift));
    }
    lines.push('Reply YES [code] to approve or NO [code] to flag each.');
    lines.push(`Details: ${backupUrl}`);
  } else {
    // Mixed
    lines.push(`Flostruction: ${totalCount} timesheet(s) from your crew.`);
    for (const shift of cleanShifts) {
      lines.push(formatShiftLine(shift));
    }
    for (const shift of flaggedShifts) {
      lines.push(formatShiftLine(shift));
    }
    lines.push(`Reply YES ALL for the first ${cleanShifts.length} (clean).`);
    const flaggedNames = flaggedShifts.map((s) => s.workerFirstName).join(', ');
    lines.push(`Reply YES [code] or NO [code] for ${flaggedNames}.`);
    lines.push(`Details: ${backupUrl}`);
  }

  return lines.join('\n');
}

/**
 * Compose a late-submission individual SMS (after 4:30pm batch has already run).
 */
export function composeLateShiftSMS(params: {
  shift: ShiftForSMS;
  backupUrl: string;
}): string {
  const { shift, backupUrl } = params;
  const code = extractCode(shift.receiptId);
  const name = `${shift.workerFirstName} ${shift.workerLastName}`;
  const hours = `${parseFloat(shift.totalHours.toFixed(1))}hrs`;

  const lines: string[] = [];
  lines.push(`Flostruction: Late timesheet from ${name}.`);
  lines.push(`${name} - ${hours} ${shift.siteName} ${code}`);

  if (isFlagged(shift)) {
    const reviewNote = getReviewNote(shift);
    lines.push(`REVIEW: ${reviewNote}`);
    lines.push(`Reply YES ${code} to approve or NO ${code} to flag.`);
    lines.push(`Details: ${backupUrl}`);
  } else {
    lines.push(`Reply YES ${code} to approve.`);
  }

  return lines.join('\n');
}

// ============================================================
// Sprint 6 — provenance-aware formatters (GEOFENCE_CONFIRMED,
// GEOFENCE_ADJUSTED, MANUAL start_time_source)
// ============================================================

import type { StartTimeSource } from '@/lib/wles/hash';

/**
 * "07:06" style short AEST time. Uses Australia/Sydney locale so the
 * timestamp matches the worker's lived time, not UTC.
 */
function formatHmAEST(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

export interface SupervisorProvenanceLineInput {
  index: number;
  workerFirstName: string;
  hoursWorked: string;
  startSource: StartTimeSource;
  geofenceDetectedAt: string | null;
  workerConfirmedStartAt: string;
}

/**
 * One line for the supervisor batch SMS showing provenance per worker.
 * e.g. "1. Joao — 8.75h (GPS: arrived 07:06)"
 */
export function formatSupervisorProvenanceLine(
  s: SupervisorProvenanceLineInput
): string {
  const head = `${s.index}. ${s.workerFirstName} — ${s.hoursWorked}h`;
  const gpsTime = s.geofenceDetectedAt ? formatHmAEST(s.geofenceDetectedAt) : null;
  const workerTime = formatHmAEST(s.workerConfirmedStartAt);
  switch (s.startSource) {
    case 'GEOFENCE_CONFIRMED':
      return `${head} (GPS: arrived ${gpsTime})`;
    case 'GEOFENCE_ADJUSTED':
      return `${head} (GPS ${gpsTime}, confirmed ${workerTime})`;
    case 'MANUAL':
      return `${head} (manual: started ${workerTime})`;
  }
}

export interface WorkerVerifiedSmsInput {
  receiptId: string;
  hoursWorked: string;
  startSource: StartTimeSource;
  geofenceDetectedAt: string | null;
  workerConfirmedStartAt: string;
  approvedAt: string;
  publicReceiptUrl: string;
}

/**
 * Post-approval SMS sent to the worker.
 */
export function formatWorkerVerifiedSms(i: WorkerVerifiedSmsInput): string {
  const gpsTime = i.geofenceDetectedAt ? formatHmAEST(i.geofenceDetectedAt) : null;
  const manualTime = formatHmAEST(i.workerConfirmedStartAt);
  const approved = formatHmAEST(i.approvedAt);

  let provenanceLine = '';
  if (i.startSource === 'GEOFENCE_CONFIRMED') {
    provenanceLine = `GPS arrival: ${gpsTime}`;
  } else if (i.startSource === 'GEOFENCE_ADJUSTED') {
    provenanceLine = `Started: ${manualTime} (GPS ${gpsTime})`;
  } else {
    provenanceLine = `Started: ${manualTime} (manual)`;
  }

  return [
    'FLOSTRUCTION — Shift verified.',
    i.receiptId,
    provenanceLine,
    `Hours: ${i.hoursWorked}`,
    `Approved: ${approved} AEST`,
    `INTACT — ${i.publicReceiptUrl}`,
  ].join('\n');
}
