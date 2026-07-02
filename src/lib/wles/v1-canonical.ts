// WLES v1.0 — §5 canonical serialisation, extracted client-safe.
//
// Moved VERBATIM from src/lib/wles/v1.ts (audit 2026-07-02) so the
// in-browser Independent Verifier (/wles/verifier) shares the EXACT
// canonicalisation code that seals production events. v1.ts imports and
// re-exports from here, so every existing test still exercises this code.
// This module MUST stay free of Node-only imports — it runs in browsers.

import { WlesEventUnsealed } from './v1-types';

/**
 * Canonicalise any JSON-representable value per WLES v1.0 §5.1.
 *
 *   • strings → RFC 8259 shortest escapes (delegated to JSON.stringify)
 *   • numbers → shortest representation (delegated to JSON.stringify)
 *   • booleans → `true` / `false` lowercase
 *   • null → `null`
 *   • arrays → element-wise canonicalised, joined by `,`
 *   • objects → keys sorted lexicographically by Unicode code unit
 *     (identical to code-point order for all WLES-defined ASCII keys),
 *     each value recursively canonicalised
 *
 * No insignificant whitespace is emitted.
 *
 * NOTE: for strict RFC 8785 JCS compliance on values containing
 * supplementary-plane characters, the sort must compare code points
 * rather than code units. WLES v1.0's defined keys are all ASCII,
 * so code-unit sort is equivalent. Payload/metadata *values* may
 * contain arbitrary Unicode and are preserved as-is through
 * JSON.stringify's escaping.
 */
export function canonicaliseValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error(`WLES v1.0 canonical JSON: non-finite number ${v}`);
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map(canonicaliseValue).join(',') + ']';
  }
  if (typeof v === 'object' && v !== undefined) {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    keys.sort();
    return (
      '{' +
      keys
        .map((k) => JSON.stringify(k) + ':' + canonicaliseValue(obj[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error(`WLES v1.0 canonical JSON: unsupported value type ${typeof v}`);
}

/**
 * Canonicalise a WLES event per §5.1. The `event_hash` field MUST
 * be excluded from the input — the hash is computed over the event
 * as it would appear BEFORE the hash is known. Callers pass the
 * event without the `event_hash` field.
 */
export function canonicaliseEvent(event: WlesEventUnsealed): string {
  // Build the canonical form explicitly — guarantees no stray fields
  // from loose callers sneak in.
  const canonicalInput: Record<string, unknown> = {
    actor_id: event.actor_id,
    event_id: event.event_id,
    event_type: event.event_type,
    payload: event.payload,
    previous_event_hash: event.previous_event_hash,
    subject_id: event.subject_id,
    timestamp: event.timestamp,
  };
  if (event.metadata !== undefined) {
    canonicalInput.metadata = event.metadata;
  }
  return canonicaliseValue(canonicalInput);
}
