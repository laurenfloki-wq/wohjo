// WLES v1.0 — canonicalisation, hashing, and verification.
//
// Reference: FLOSMOSIS/standards/WLES-v1.0-Specification.md
// Sections 5 (canonical serialisation), 6 (hash algorithm),
// 8 (verification protocol).
//
// This module is independent of the legacy `hash.ts` /
// `chain-verify.ts` modules — those handle pre-standard v0
// records for historical verification. New events seal here.

import { createHash } from 'crypto';
import {
  WlesEvent,
  WlesEventUnsealed,
  Sha256Hex,
  ZERO_HASH,
  isValidEventType,
} from './v1-types';
import { canonicaliseEvent } from './v1-canonical';

// ──────────────────────────────────────────────────────────────────────
// §5 — canonical serialisation
// ──────────────────────────────────────────────────────────────────────

// §5 canonical serialisation now lives in ./v1-canonical (client-safe,
// shared verbatim with the in-browser verifier). Re-exported below so the
// public API of this module is unchanged.

// ──────────────────────────────────────────────────────────────────────
// §6 — hash algorithm
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 of the canonical serialisation of an event
 * (with `event_hash` excluded), per §6.1. Returns 64 lowercase hex
 * characters.
 */
export function hashEvent(event: WlesEventUnsealed): Sha256Hex {
  const canonical = canonicaliseEvent(event);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Convenience — seal an unsealed event by computing its hash and
 * producing the final sealed object.
 */
export function sealEvent(event: WlesEventUnsealed): WlesEvent {
  return { ...event, event_hash: hashEvent(event) };
}

// ──────────────────────────────────────────────────────────────────────
// §8.1 — single-event verification
// ──────────────────────────────────────────────────────────────────────

export interface SingleEventVerificationResult {
  ok: boolean;
  reason?: 'HASH_MISMATCH' | 'INVALID_EVENT_TYPE' | 'MISSING_REQUIRED_FIELD' |
    'MALFORMED_HASH' | 'MALFORMED_PREVIOUS_HASH';
  expected?: Sha256Hex;
  actual?: Sha256Hex;
  message?: string;
}

function isValidSha256Hex(s: unknown): s is Sha256Hex {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

export function verifyEvent(event: WlesEvent): SingleEventVerificationResult {
  if (!event || typeof event !== 'object') {
    return { ok: false, reason: 'MISSING_REQUIRED_FIELD', message: 'event is not an object' };
  }
  // Required field checks
  for (const field of ['event_id', 'event_type', 'event_hash', 'previous_event_hash', 'actor_id', 'subject_id', 'timestamp', 'payload'] as const) {
    if (event[field] === undefined || event[field] === null) {
      return { ok: false, reason: 'MISSING_REQUIRED_FIELD', message: `missing field: ${field}` };
    }
  }
  if (!isValidSha256Hex(event.event_hash)) {
    return { ok: false, reason: 'MALFORMED_HASH', message: `event_hash is not 64-char lowercase hex: ${event.event_hash}` };
  }
  if (!isValidSha256Hex(event.previous_event_hash)) {
    return { ok: false, reason: 'MALFORMED_PREVIOUS_HASH', message: `previous_event_hash is not 64-char lowercase hex: ${event.previous_event_hash}` };
  }
  if (!isValidEventType(event.event_type)) {
    return { ok: false, reason: 'INVALID_EVENT_TYPE', message: `event_type "${event.event_type}" is not a committed type nor a valid X-<ns>-<name> extension` };
  }
  const { event_hash, ...rest } = event;
  const expected = hashEvent(rest);
  if (expected !== event_hash) {
    return { ok: false, reason: 'HASH_MISMATCH', expected, actual: event_hash };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// §8.2 — chain verification
// ──────────────────────────────────────────────────────────────────────

export interface ChainVerificationResult {
  ok: boolean;
  events_scanned: number;
  failures: Array<{
    index: number;
    event_id: string;
    reason: SingleEventVerificationResult['reason'] | 'GENESIS_LINK_INVALID' | 'PREVIOUS_LINK_BROKEN';
    expected?: Sha256Hex;
    actual?: Sha256Hex;
    message?: string;
  }>;
}

/**
 * Verify a chain of events per §8.2. Events MUST be pre-sorted in
 * the chain's canonical order — the caller's responsibility. This
 * function walks the array as given.
 *
 * First event: previous_event_hash MUST equal ZERO_HASH.
 * Subsequent events: previous_event_hash MUST equal the prior event's event_hash.
 * Every event: single-event verification must pass.
 *
 * On failure, scanning continues so the caller sees the full extent
 * of any break. This matches the existing legacy `verifyCompanyChain`
 * behaviour and is useful for downstream alerts.
 */
export function verifyChain(events: WlesEvent[]): ChainVerificationResult {
  const failures: ChainVerificationResult['failures'] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // §8.1 single-event check
    const single = verifyEvent(ev);
    if (!single.ok) {
      failures.push({
        index: i,
        event_id: ev?.event_id ?? '<unknown>',
        reason: single.reason,
        ...(single.expected !== undefined ? { expected: single.expected } : {}),
        ...(single.actual !== undefined ? { actual: single.actual } : {}),
        ...(single.message !== undefined ? { message: single.message } : {}),
      });
    }

    // §8.2 linkage check
    if (i === 0) {
      if (ev.previous_event_hash !== ZERO_HASH) {
        failures.push({
          index: i,
          event_id: ev.event_id,
          reason: 'GENESIS_LINK_INVALID',
          expected: ZERO_HASH,
          actual: ev.previous_event_hash,
          message: `first event's previous_event_hash must be the zero hash`,
        });
      }
    } else {
      const prev = events[i - 1];
      if (ev.previous_event_hash !== prev.event_hash) {
        failures.push({
          index: i,
          event_id: ev.event_id,
          reason: 'PREVIOUS_LINK_BROKEN',
          expected: prev.event_hash,
          actual: ev.previous_event_hash,
          message: `previous_event_hash does not match preceding event's event_hash`,
        });
      }
    }
  }

  return { ok: failures.length === 0, events_scanned: events.length, failures };
}

// ──────────────────────────────────────────────────────────────────────
// Convenience re-exports
// ──────────────────────────────────────────────────────────────────────

export { ZERO_HASH };
export { canonicaliseEvent, canonicaliseValue } from './v1-canonical';
export type { WlesEvent, WlesEventUnsealed } from './v1-types';
