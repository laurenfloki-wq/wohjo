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
// Generic event hash with canonical JSON serialisation.
//
// 2026-05-01 substrate-DD finding: PostgreSQL JSONB does NOT preserve
// key insertion order. The original implementation used JSON.stringify
// which produces different bytes for the same logical data depending on
// key insertion order. At write time the keys were ordered as the
// client/server sent them; at read time PG returns them in PG's
// canonical (alphabetical) order. JSON.stringify on the read-back
// produces different bytes than JSON.stringify on the write path,
// causing SHA-256 SELF_HASH_MISMATCH at verification.
//
// Fix: canonicalStringify sorts keys alphabetically, recursively, so the
// SAME logical data produces the SAME bytes regardless of insertion
// order or storage-layer canonicalisation. Implements a simplified
// subset of RFC 8785 (JSON Canonicalization Scheme) — key-sort only.
// FLOSTRUCTION's event_data shape (object with primitive values, no
// nested numerics requiring number-canonicalisation, no NaN/Infinity)
// makes the simpler subset sufficient.
//
// WLES specification implication: future v1.0.x revision should specify
// canonical JSON serialisation per RFC 8785. That is a Constitution
// cl 4.1 Board-approved spec amendment, out of scope for this hotfix.
// ---------------------------------------------------------------

/**
 * Canonical JSON serialisation. Sorts object keys alphabetically,
 * recursively, before stringifying. Arrays preserve order
 * (arrays are inherently ordered). Primitives use JSON.stringify
 * directly. NaN and Infinity will throw via JSON.stringify, matching
 * the standard's exclusion of those values.
 *
 * Required because PostgreSQL JSONB normalises key order at storage,
 * so write-time JSON.stringify(event_data) and read-time
 * JSON.stringify(event_data) produce different bytes.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalStringify).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalStringify(record[k]))
      .join(',') +
    '}'
  );
}

interface ShiftEventInput {
  company_id: string;
  worker_id: string;
  site_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: Date;
}

export function generateEventHash(event: ShiftEventInput): string {
  // Canonicalised serialisation — see canonicalStringify above for the
  // substrate-DD rationale. created_at.toISOString() produces a stable
  // millisecond-precision string; if a future code path needs to hash
  // a timestamp at sub-millisecond precision, that handling must be
  // added here explicitly.
  const input = [
    event.company_id,
    event.worker_id,
    event.site_id,
    event.event_type,
    canonicalStringify(event.event_data),
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

/**
 * Structured chain-verification result.
 *
 * `valid: true` indicates every event in the chain (a) self-hashes
 * correctly under generateEventHash(), AND (b) links to its predecessor
 * via the previous_event_hash field, with the FIRST event accepted as
 * a chain root (previous_event_hash null or 'GENESIS').
 *
 * `valid: false` carries a reason. Reasons mirror chain-verify.ts
 * MismatchReason values so downstream UI can show specific diagnostic
 * detail rather than a binary "Chain compromised X" state.
 */
export type ChainVerifyResult =
  | { valid: true }
  | {
      valid: false;
      /** Index of the failing event (0-based) once chronologically sorted */
      index: number;
      /** Failing event id (when available) */
      eventId?: string;
      reason:
        | 'EMPTY_CHAIN'
        | 'SELF_HASH_MISMATCH'        // recomputed SHA-256 != stored event_hash
        | 'GENESIS_LINK_INVALID'      // first event has non-null/non-GENESIS prev
        | 'PREVIOUS_LINK_BROKEN';     // mid-chain prev != prior event_hash
      detail?: string;
    };

/**
 * Verify a chain of shift_events. Returns a structured result so the
 * audit-trail UI can surface a specific reason for any failure rather
 * than a binary state. Defensive chronological sort applied — caller
 * may pass an unsorted array; verification still proceeds in
 * (created_at ASC) order.
 *
 * Chain semantics:
 *   - First event MUST be a chain root: previous_event_hash IS NULL or
 *     the literal string 'GENESIS'.
 *   - Subsequent events MUST have previous_event_hash equal to the
 *     prior event's event_hash.
 *   - Every event's event_hash MUST match the SHA-256 recomputed via
 *     generateEventHash() over its content. (See known precision
 *     gotchas in hash.test.ts; bug surfacing 2026-05-01 on Joao's
 *     IN_PROGRESS shift suggests a JSONB / timestamp round-trip issue
 *     at the data-fetch layer rather than a logic issue here.)
 */
export function verifyHashChainDetailed(events: ShiftEvent[]): ChainVerifyResult {
  if (events.length === 0) {
    return { valid: false, index: 0, reason: 'EMPTY_CHAIN' };
  }

  // Defensive chronological sort — verifyHashChain is correct only when
  // events are presented in (created_at ASC) order. Stable sort by
  // created_at, then by id as a tie-breaker.
  const sorted = [...events].sort((a, b) => {
    const ta = a.created_at.getTime();
    const tb = b.created_at.getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const expectedHash = generateEventHash({
      company_id: event.company_id,
      worker_id: event.worker_id,
      site_id: event.site_id,
      event_type: event.event_type,
      event_data: event.event_data,
      created_at: event.created_at,
    });
    if (event.event_hash !== expectedHash) {
      return {
        valid: false,
        index: i,
        eventId: event.id,
        reason: 'SELF_HASH_MISMATCH',
        detail: `expected ${expectedHash.slice(0, 12)}…, got ${event.event_hash.slice(0, 12)}…`,
      };
    }

    if (i === 0) {
      // First event in chain: accept null or the literal 'GENESIS' as
      // valid genesis markers.
      if (event.previous_event_hash !== null && event.previous_event_hash !== 'GENESIS') {
        return {
          valid: false,
          index: 0,
          eventId: event.id,
          reason: 'GENESIS_LINK_INVALID',
          detail: `first event must have previous_event_hash NULL or 'GENESIS'; got ${event.previous_event_hash}`,
        };
      }
    } else {
      const prevEvent = sorted[i - 1];
      if (event.previous_event_hash !== prevEvent.event_hash) {
        return {
          valid: false,
          index: i,
          eventId: event.id,
          reason: 'PREVIOUS_LINK_BROKEN',
          detail: `event ${i} previous_event_hash does not match prior event_hash`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Boolean-only convenience wrapper kept for the binary "chain intact?"
 * use case. Internally calls verifyHashChainDetailed and returns true
 * iff the chain is valid. The empty-chain case returns TRUE here for
 * historical compatibility (an empty chain has no broken links to
 * report); use verifyHashChainDetailed when an empty chain should be
 * surfaced as EMPTY_CHAIN diagnostically.
 */
export function verifyHashChain(events: ShiftEvent[]): boolean {
  if (events.length === 0) return true;
  return verifyHashChainDetailed(events).valid;
}
