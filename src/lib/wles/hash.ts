import { createHash } from 'crypto';

// ---------------------------------------------------------------
// Sprint 6 — ShiftCommit provenance hashing
// Adds geofence_detected_at, worker_confirmed_start_at, and
// start_time_source to the WLES hash input for SHIFT_COMMIT events.
// Kept alongside the generic generateEventHash() below so existing
// event hashes remain verifiable without migration.
// ---------------------------------------------------------------

export type StartTimeSource =
  | 'GEOFENCE_CONFIRMED'
  | 'GEOFENCE_ADJUSTED'
  | 'MANUAL';

export interface ShiftCommitHashInput {
  id: string;
  workerId: string;
  siteId: string;
  /** null if no geofence detected that day */
  geofenceDetectedAt: string | null;
  workerConfirmedStartAt: string;
  startTimeSource: StartTimeSource;
  clockOutAt: string;
  /** decimal string, e.g. "8.75" — never a JS number */
  hoursWorked: string;
  supervisorId: string;
  /** null until APPROVAL event */
  approvedAt: string | null;
  /** empty string for genesis */
  previousEventHash: string;
}

const FIELD_SEPARATOR = '|';
const NULL_SENTINEL = 'NULL';
const NOT_DETECTED = 'NOT_DETECTED';

export function serialiseShiftCommitForHash(input: ShiftCommitHashInput): string {
  return [
    input.id,
    input.workerId,
    input.siteId,
    input.geofenceDetectedAt ?? NOT_DETECTED,
    input.workerConfirmedStartAt,
    input.startTimeSource,
    input.clockOutAt,
    input.hoursWorked,
    input.supervisorId,
    input.approvedAt ?? NULL_SENTINEL,
    input.previousEventHash,
  ].join(FIELD_SEPARATOR);
}

export function hashShiftCommit(input: ShiftCommitHashInput): string {
  return createHash('sha256')
    .update(serialiseShiftCommitForHash(input))
    .digest('hex');
}

export function verifyShiftCommitHash(
  input: ShiftCommitHashInput,
  storedEventHash: string,
): boolean {
  return hashShiftCommit(input) === storedEventHash;
}

// ---------------------------------------------------------------
// Legacy generic event hash (pre-Sprint-6) — kept verbatim so
// historical event hashes still verify.
// ---------------------------------------------------------------

interface ShiftEventInput {
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: Date;
}

export function generateEventHash(event: ShiftEventInput): string {
  const input = [
    event.company_id,
    event.worker_id,
    event.site_id,
    event.event_type,
    JSON.stringify(event.event_data),
    event.created_at.toISOString(),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}

interface ShiftEvent {
  id: string;
  event_hash: string;
  previous_event_hash: string | null;
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: Date;
}

export function verifyHashChain(events: ShiftEvent[]): boolean {
  if (events.length === 0) return true;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expectedHash = generateEventHash({
      company_id: event.company_id,
      worker_id: event.worker_id,
      site_id: event.site_id,
      event_type: event.event_type,
      event_data: event.event_data,
      created_at: event.created_at,
    });
    if (event.event_hash !== expectedHash) return false;
    if (i > 0) {
      const prevEvent = events[i - 1];
      if (event.previous_event_hash !== prevEvent.event_hash) return false;
    } else {
      // First event in chain: accept null or "GENESIS" as valid genesis markers
      if (event.previous_event_hash !== null && event.previous_event_hash !== 'GENESIS') return false;
    }
  }
  return true;
}
