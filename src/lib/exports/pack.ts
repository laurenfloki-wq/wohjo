// FLOSTRUCTION — export pack: JCS manifest + fingerprint + idempotency.
//
// Phase 1 §3a. A pack is a single export operation's evidence shape:
// the canonical manifest, its SHA-256 fingerprint (the stable
// identifier used by the public /verify/pack/[fingerprint] surface),
// and a permanent idempotency key (UNIQUE on export_packs).
//
// JCS implementation is shared with the WLES v1.0 seal via
// `canonicaliseJson` from src/lib/wles/v1 so the manifest fingerprint
// and the event seal use the SAME canonicaliser. Drift here would
// produce manifest fingerprints that an independent verifier cannot
// reproduce — a credibility-critical defect.

import { createHash } from 'crypto';
import { canonicaliseJson } from '@/lib/wles/v1';

/**
 * Per-shift line in the manifest. The fields below are the minimum
 * shape needed for the inclusion proof + the Evidence Pack PDF
 * rendering. Hours and rates do NOT appear here — pack_fingerprint
 * is over an integrity-only manifest. Public-surface readers see
 * even less (per §J of the Phase 1 spec).
 */
export interface PackShiftEntry {
  shift_id: string;
  receipt_id: string;
  worker_id: string;
  shift_date: string;             // ISO 8601 date (YYYY-MM-DD)
  total_hours_x100: number;       // integer hundredths to avoid float drift
  event_chain_segment: Array<{
    event_hash: string;
    previous_event_hash: string;
  }>;
}

export interface PackManifestInput {
  pack_format_version: 'pack-v1.0';
  company_id: string;
  pay_period_start: string;       // ISO 8601 date
  pay_period_end: string;         // ISO 8601 date
  export_target: string;
  /** Permanent idempotency key — also stored separately on the row. */
  idempotency_key: string;
  /** v1 chain tip at the moment the pack was sealed. */
  v1_chain_tip_hash: string;
  /** The pre-cutover frozen anchor — included so the pack is self-attesting. */
  frozen_anchor: {
    id: 'FROZEN_ANCHOR_V0';
    fingerprint: string;
    count: number;
    formula: string;                 // documentation only — the verifier carries its own copy
    bound_at: string;                // ISO 8601 datetime
    scope: string;                   // human-readable scope description
  };
  shifts: PackShiftEntry[];
  /** WLES bridge event hash — the v0/v1 cutover record. */
  bridge_event_hash: string;
}

/**
 * Order-stable manifest construction: array elements are sorted by
 * shift_id so the same input always produces byte-identical canonical
 * bytes. Within event_chain_segment the caller-provided order is
 * preserved (the chain is ordered by time).
 */
export function buildPackManifest(input: PackManifestInput): PackManifestInput {
  const shifts = input.shifts
    .map((s) => ({
      ...s,
      event_chain_segment: s.event_chain_segment.map((e) => ({
        event_hash: e.event_hash,
        previous_event_hash: e.previous_event_hash,
      })),
    }))
    .sort((a, b) => (a.shift_id < b.shift_id ? -1 : a.shift_id > b.shift_id ? 1 : 0));
  return { ...input, shifts };
}

/**
 * Canonical JSON serialisation of the manifest, per RFC 8785 JCS via
 * the shared WLES canonicaliser.
 */
export function manifestCanonicalBytes(input: PackManifestInput): string {
  return canonicaliseJson(input);
}

/**
 * Pack fingerprint — SHA-256 lowercase hex of the canonical bytes.
 * The stable identifier referenced by the public verify surface and
 * embedded in the Evidence Pack PDF first page.
 */
export function packFingerprint(input: PackManifestInput): string {
  return createHash('sha256').update(manifestCanonicalBytes(input), 'utf8').digest('hex');
}

/**
 * Idempotency key — SHA-256 over the request shape. Permanent: lives
 * on export_packs.idempotency_key UNIQUE so replays return the prior
 * pack_id via ON CONFLICT (idempotency_key) DO NOTHING RETURNING id.
 *
 * Inputs sorted lexicographically on the shift_id array so two
 * callers issuing the same export in different order produce the
 * same key.
 */
export function computeIdempotencyKey(input: {
  company_id: string;
  pay_period_start: string;
  pay_period_end: string;
  shift_ids: string[];
  export_target: string;
}): string {
  const sortedIds = [...input.shift_ids].sort();
  const composite = [
    input.company_id,
    input.pay_period_start,
    input.pay_period_end,
    sortedIds.join(','),
    input.export_target,
  ].join('|');
  return createHash('sha256').update(composite, 'utf8').digest('hex');
}

/**
 * Compute a SHA-256 over arbitrary bytes (e.g. the stored payroll
 * file or PDF). Used for payroll_file_hash and audit_pack_hash on
 * the export_packs row.
 */
export function hashBytes(bytes: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
