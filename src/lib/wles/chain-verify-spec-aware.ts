// ---------------------------------------------------------------
// SG-4 / Dispatch 2 Workstream A — spec-version-aware WLES chain
// verification.
//
// WHY THIS EXISTS (the monitor-correctness finding, 12 June 2026):
// chain_integrity_shift_events was RED on 12/37 events while
// anchor_fingerprint was GREEN. Recomputation against production
// (read-only, 2026-06-12) proved every one of the 12 is intact —
// the monitor was recomputing them with the wrong method:
//
//   1. Six SUPERVISOR_APPROVAL events were annotated IN PLACE by the
//      CRACK 72 duplicate-tagging pass (2026-05-07), which added the
//      keys historical_duplicate / tagged_at / tagged_reason AFTER
//      sealing. Recomputing the canonical hash over event_data MINUS
//      those three keys reproduces the stored hash EXACTLY (6/6).
//   2. One START_EVENT (2026-04-30, the first production event) was
//      sealed BEFORE the 2026-05-01 canonicalStringify hotfix, under
//      plain JSON.stringify with the writer's insertion order
//      [start_time, shift_date, gps_lat, gps_lng, client_event_id].
//      That order reproduces the stored hash EXACTLY.
//   3. Four START_EVENTs carry previous_event_hash NULL because v0's
//      write-time chain semantics open a NEW SEGMENT at each shift
//      start. The company-wide-chain assumption was the verifier's,
//      never the writer's.
//   4. One spec 1.0 EXPORT_RECORD (2026-06-06) hash-verifies EXACTLY
//      under WLES v1.0 §6 but carries the pre-writer-fix legacy type
//      name 'EXPORT_RECORD' instead of 'X-FLOSMOSIS-EXPORT_RECORD'
//      (writer fixed on main before 2026-06-07). The cron previously
//      collapsed this INVALID_EVENT_TYPE into SELF_HASH_MISMATCH.
//
// THE CONTRACT (the product claim this module restores):
//   "The page goes red only if the mathematics does."
//   * Every acceptance path below requires an EXACT SHA-256 match
//     against a single documented serialisation. Nothing is skipped,
//     baselined, or filtered — a tampered event fails every path.
//   * The CRACK 72 path strips ONLY the three documented annotation
//     keys and ONLY when tagged_reason carries the CRACK 72 marker;
//     a mutation to any original field still fails (tag keys cannot
//     be used to smuggle changes — the original content is what is
//     hashed).
//   * The pre-canonicalisation path applies ONLY to events sealed
//     before V0_CANONICALISATION_FIX_AT, ONLY to event types with a
//     documented writer key order, ONLY when the stored key set is
//     exactly that order's key set, and ONLY for primitive values.
//   * v0 segment genesis (START_EVENT, previous NULL) is the
//     documented v0 chain-origin form. Deletion coverage for the
//     pre-cutover v0 population is provided by FROZEN_ANCHOR_V0
//     (count + fingerprint), not by v0 linkage.
//   * v1 events verify per WLES v1.0 §8 (single-event §8.1 + chain
//     linkage §8.2 over the v1 subsequence, genesis = ZERO_HASH).
//     The single attested legacy-type-name class is accepted only
//     when the §6 hash verifies AND the name is in the documented
//     legacy set AND the event predates the writer fix.
//
// Relationship to chain-baseline.ts (spine ruling 2026-06-12): the
// baseline remains in place for the ex_baseline operational signal,
// but under this verifier the RAW check itself returns
// mismatch_count = 0 on clean data, so the baseline exclusion is a
// no-op. RED now means genuine tampering.
// ---------------------------------------------------------------

import { createHash } from 'crypto';
import { generateEventHash } from './hash';
import { verifyEvent as verifyV1Event, hashEvent as hashV1Event } from './v1';
import { ZERO_HASH, type WlesEvent } from './v1-types';
import type { ShiftEventRow } from './chain-verify';

// The canonicalStringify hotfix deploy boundary. The 2026-04-30
// 20:55:46.881Z START_EVENT is the only production event sealed
// before it; the next events (2026-05-01 05:38:22Z) already verify
// canonically. Any event AFTER this instant must verify canonically.
export const V0_CANONICALISATION_FIX_AT = Date.parse('2026-05-01T00:00:00Z');

// The v1-translate writer fix boundary: after this instant every
// sealed v1 event must carry a spec-conformant event_type (committed
// or X-<ns>-<name>). The single pre-fix instance is 2026-06-06.
export const V1_TYPE_NAME_WRITER_FIX_AT = Date.parse('2026-06-07T00:00:00Z');

// CRACK 72 duplicate-tagging annotation keys (2026-05-07 pass).
export const CRACK72_TAG_KEYS = ['historical_duplicate', 'tagged_at', 'tagged_reason'] as const;
export const CRACK72_REASON_MARKER = 'CRACK 72';

// Documented v0 writer insertion orders for events sealed before the
// canonicalisation fix. Only listed types are eligible for the
// pre-canonicalisation acceptance path.
export const V0_PRE_CANONICAL_KEY_ORDER: Readonly<Record<string, readonly string[]>> = {
  START_EVENT: ['start_time', 'shift_date', 'gps_lat', 'gps_lng', 'client_event_id'],
};

// Legacy committed-type names attested as a pre-fix v1 writer bug.
// Grows only with a documented attribution (see PR body / evidence).
const V1_LEGACY_TYPE_NAMES: ReadonlySet<string> = new Set(['EXPORT_RECORD']);

export type SpecAwareReason =
  | 'SELF_HASH_MISMATCH'
  | 'PREVIOUS_LINK_BROKEN'
  | 'GENESIS_LINK_INVALID'
  | 'V1_HASH_MISMATCH'
  | 'V1_INVALID_EVENT_TYPE'
  | 'V1_MALFORMED_HASH'
  | 'V1_MALFORMED_PREVIOUS_HASH'
  | 'V1_MISSING_REQUIRED_FIELD'
  | 'V1_GENESIS_LINK_INVALID'
  | 'V1_PREVIOUS_LINK_BROKEN';

export type VerifiedPath =
  | 'V0_CANONICAL'
  | 'V0_ANNOTATED_CRACK72'
  | 'V0_PRE_CANONICALISATION'
  | 'V1_CANONICAL'
  | 'V1_TYPE_NAME_ANOMALY_PRE_FIX';

export interface SpecAwareMismatch {
  event_id: string;
  company_id: string | null;
  event_type: string;
  reason: SpecAwareReason;
  expected: string;
  actual: string;
  created_at: string;
}

export interface SpecAwareNote {
  event_id: string;
  note: VerifiedPath | 'V0_SEGMENT_GENESIS';
}

export interface SpecAwareChainReport {
  company_id: string | null;
  events_scanned: number;
  ok: boolean;
  mismatches: SpecAwareMismatch[];
  /** How many events verified under each acceptance path. */
  path_tally: Partial<Record<VerifiedPath, number>>;
  /** Non-default observations, all hash-verified (never failures). */
  notes: SpecAwareNote[];
}

export interface ShiftEventRowSpecAware extends ShiftEventRow {
  spec_version?: string | null;
  wles_event?: WlesEvent | null;
}

function toIso(v: string | Date): string {
  return typeof v === 'string' ? v : v.toISOString();
}
function toDate(v: string | Date): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

function isPrimitive(v: unknown): boolean {
  return v === null || (typeof v !== 'object' && typeof v !== 'function');
}

/**
 * Replicate the pre-canonicalisation writer serialisation: plain
 * JSON.stringify over an object whose keys were inserted in the
 * documented writer order. Returns null when the event is not
 * eligible (key set differs, or any non-primitive value — nested
 * insertion order would be unknowable).
 */
function legacyOrderStringify(
  data: Record<string, unknown>,
  order: readonly string[],
): string | null {
  const keys = Object.keys(data);
  if (keys.length !== order.length) return null;
  const keySet = new Set(keys);
  for (const k of order) {
    if (!keySet.has(k)) return null;
    if (!isPrimitive(data[k])) return null;
  }
  return '{' + order.map((k) => `${JSON.stringify(k)}:${JSON.stringify(data[k])}`).join(',') + '}';
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function hashWithSerialisedData(ev: ShiftEventRowSpecAware, serialisedData: string): string {
  const input = [
    ev.company_id ?? '',
    ev.worker_id ?? '',
    ev.site_id ?? '',
    ev.event_type,
    serialisedData,
    toDate(ev.created_at).toISOString(),
  ].join('|');
  return sha256Hex(input);
}

interface V0SelfResult {
  ok: boolean;
  path?: VerifiedPath;
  expected: string;
}

/** Spec-aware v0 self-hash verification. Acceptance paths documented above. */
export function verifyV0SelfHash(ev: ShiftEventRowSpecAware): V0SelfResult {
  // Path 1 — canonical (the post-2026-05-01 writer method).
  const canonical = generateEventHash({
    company_id: ev.company_id ?? '',
    worker_id: ev.worker_id ?? '',
    site_id: ev.site_id ?? '',
    event_type: ev.event_type,
    event_data: ev.event_data,
    created_at: toDate(ev.created_at),
  });
  if (ev.event_hash === canonical) {
    return { ok: true, path: 'V0_CANONICAL', expected: canonical };
  }

  // Path 2 — CRACK 72 post-seal annotation: strip exactly the three
  // documented tag keys and recompute. Original content is what is
  // hashed, so any mutation to an original field still fails here.
  const data = ev.event_data as Record<string, unknown>;
  const hasAllTags = CRACK72_TAG_KEYS.every((k) => k in data);
  const taggedReason = data['tagged_reason'];
  if (
    hasAllTags &&
    typeof taggedReason === 'string' &&
    taggedReason.includes(CRACK72_REASON_MARKER)
  ) {
    const stripped: Record<string, unknown> = { ...data };
    for (const k of CRACK72_TAG_KEYS) delete stripped[k];
    const strippedHash = generateEventHash({
      company_id: ev.company_id ?? '',
      worker_id: ev.worker_id ?? '',
      site_id: ev.site_id ?? '',
      event_type: ev.event_type,
      event_data: stripped,
      created_at: toDate(ev.created_at),
    });
    if (ev.event_hash === strippedHash) {
      return { ok: true, path: 'V0_ANNOTATED_CRACK72', expected: strippedHash };
    }
  }

  // Path 3 — pre-canonicalisation seal (documented writer key order,
  // plain JSON.stringify, primitives only, pre-fix events only).
  if (toDate(ev.created_at).getTime() < V0_CANONICALISATION_FIX_AT) {
    const order = V0_PRE_CANONICAL_KEY_ORDER[ev.event_type];
    if (order) {
      const legacyJson = legacyOrderStringify(data, order);
      if (legacyJson !== null) {
        const legacyHash = hashWithSerialisedData(ev, legacyJson);
        if (ev.event_hash === legacyHash) {
          return { ok: true, path: 'V0_PRE_CANONICALISATION', expected: legacyHash };
        }
      }
    }
  }

  return { ok: false, expected: canonical };
}

export interface SelfHashResult {
  ok: boolean;
  /** Acceptance path when ok. */
  path?: VerifiedPath;
  /** Failure reason when !ok. */
  reason?: SpecAwareReason;
  /** The recomputed hash (or a diagnostic note for type anomalies). */
  expected: string;
}

/**
 * Spec-aware SINGLE-EVENT self-hash verification — WLES v1.0 §8.1 for
 * v1 rows, the documented v0 acceptance paths (canonical / CRACK 72
 * annotation / pre-canonicalisation) for v0 rows. NO chain linkage is
 * checked here.
 *
 * This is the per-event kernel `verifyCompanyChainSpecAware` applies in
 * its loop, exposed so other readers verify each event under the method
 * it was SEALED with rather than assuming v0. The audit-pack generator
 * uses it: recomputing a v1-sealed event (e.g. an EXPORT_RECORD, whose
 * authoritative hash is the v1 JCS hash over the canonical wles_event)
 * with the v0 algorithm always mismatches and would wrongly turn a
 * clean pack RED.
 *
 * Keep this in lockstep with the §8.1 decision inside
 * verifyCompanyChainSpecAware — both delegate to the same primitives
 * (verifyV1Event / hashV1Event / verifyV0SelfHash); only the
 * tally/notes/linkage bookkeeping differs.
 */
export function verifyEventSelfHashSpecAware(ev: ShiftEventRowSpecAware): SelfHashResult {
  const isV1 = ev.spec_version === '1.0' && ev.wles_event != null;
  if (isV1) {
    const w = ev.wles_event as WlesEvent;
    const single = verifyV1Event(w);
    if (single.ok) {
      return { ok: true, path: 'V1_CANONICAL', expected: w.event_hash };
    }
    if (single.reason === 'INVALID_EVENT_TYPE') {
      const { event_hash, ...rest } = w;
      const recomputed = hashV1Event(rest);
      const preFix = toDate(ev.created_at).getTime() < V1_TYPE_NAME_WRITER_FIX_AT;
      if (recomputed === event_hash && V1_LEGACY_TYPE_NAMES.has(w.event_type) && preFix) {
        return { ok: true, path: 'V1_TYPE_NAME_ANOMALY_PRE_FIX', expected: event_hash };
      }
      return {
        ok: false,
        reason: 'V1_INVALID_EVENT_TYPE',
        expected: recomputed === event_hash ? '(hash ok, type nonconformant)' : recomputed,
      };
    }
    return {
      ok: false,
      reason: `V1_${single.reason}` as SpecAwareReason,
      expected: single.expected ?? single.message ?? '',
    };
  }

  const v0 = verifyV0SelfHash(ev);
  if (v0.ok && v0.path) {
    return { ok: true, path: v0.path, expected: v0.expected };
  }
  return { ok: false, reason: 'SELF_HASH_MISMATCH', expected: v0.expected };
}

/**
 * Verify a single company's events under spec-aware dual-mode rules.
 * Events MUST be pre-sorted by (created_at ASC, id ASC) — the same
 * contract as the legacy verifyCompanyChain.
 *
 * Scanning never short-circuits: every breakage in a damaged chain is
 * reported in one pass.
 */
export function verifyCompanyChainSpecAware(
  events: ShiftEventRowSpecAware[],
): SpecAwareChainReport {
  const mismatches: SpecAwareMismatch[] = [];
  const notes: SpecAwareNote[] = [];
  const path_tally: Partial<Record<VerifiedPath, number>> = {};
  if (events.length === 0) {
    return { company_id: null, events_scanned: 0, ok: true, mismatches, path_tally, notes };
  }
  const company_id = events[0].company_id;
  const tally = (p: VerifiedPath) => {
    path_tally[p] = (path_tally[p] ?? 0) + 1;
  };
  const push = (
    ev: ShiftEventRowSpecAware,
    reason: SpecAwareReason,
    expected: string,
    actual: string,
  ) => {
    mismatches.push({
      event_id: ev.id,
      company_id: ev.company_id,
      event_type: ev.event_type,
      reason,
      expected,
      actual,
      created_at: toIso(ev.created_at),
    });
  };

  let prevV0: ShiftEventRowSpecAware | null = null;
  let sawAnyV0 = false;
  let prevV1: WlesEvent | null = null;
  let sawAnyV1 = false;

  for (const ev of events) {
    const isV1 = ev.spec_version === '1.0' && ev.wles_event != null;

    if (isV1) {
      const w = ev.wles_event as WlesEvent;

      // §8.1 single-event verification, with the attested pre-fix
      // legacy-type-name acceptance (hash must STILL verify exactly).
      const single = verifyV1Event(w);
      if (single.ok) {
        tally('V1_CANONICAL');
      } else if (single.reason === 'INVALID_EVENT_TYPE') {
        const { event_hash, ...rest } = w;
        const recomputed = hashV1Event(rest);
        const preFix = toDate(ev.created_at).getTime() < V1_TYPE_NAME_WRITER_FIX_AT;
        if (recomputed === event_hash && V1_LEGACY_TYPE_NAMES.has(w.event_type) && preFix) {
          tally('V1_TYPE_NAME_ANOMALY_PRE_FIX');
          notes.push({ event_id: ev.id, note: 'V1_TYPE_NAME_ANOMALY_PRE_FIX' });
        } else {
          push(
            ev,
            'V1_INVALID_EVENT_TYPE',
            recomputed === event_hash ? '(hash ok, type nonconformant)' : recomputed,
            w.event_type,
          );
        }
      } else {
        const reason = `V1_${single.reason}` as SpecAwareReason;
        push(ev, reason, single.expected ?? single.message ?? '', single.actual ?? w.event_hash);
      }

      // §8.2 linkage over the v1 subsequence.
      if (!sawAnyV1) {
        if (w.previous_event_hash !== ZERO_HASH) {
          push(ev, 'V1_GENESIS_LINK_INVALID', ZERO_HASH, w.previous_event_hash);
        }
      } else if (prevV1 && w.previous_event_hash !== prevV1.event_hash) {
        push(ev, 'V1_PREVIOUS_LINK_BROKEN', prevV1.event_hash, w.previous_event_hash);
      }
      sawAnyV1 = true;
      prevV1 = w;
      continue;
    }

    // ---- v0 path ----
    const self = verifyV0SelfHash(ev);
    if (self.ok && self.path) {
      tally(self.path);
      if (self.path !== 'V0_CANONICAL') {
        notes.push({ event_id: ev.id, note: self.path });
      }
    } else {
      push(ev, 'SELF_HASH_MISMATCH', self.expected, ev.event_hash);
    }

    // v0 linkage with documented segment-genesis semantics.
    if (!sawAnyV0) {
      if (ev.previous_event_hash !== null && ev.previous_event_hash !== 'GENESIS') {
        push(ev, 'GENESIS_LINK_INVALID', 'NULL or GENESIS', ev.previous_event_hash);
      }
    } else if (ev.previous_event_hash === null) {
      if (ev.event_type === 'START_EVENT') {
        // Documented v0 chain-origin: each shift start opens a new
        // segment. Deletion coverage for the v0 population comes from
        // FROZEN_ANCHOR_V0, not linkage.
        notes.push({ event_id: ev.id, note: 'V0_SEGMENT_GENESIS' });
      } else {
        push(ev, 'GENESIS_LINK_INVALID', prevV0?.event_hash ?? 'NULL or GENESIS', 'NULL');
      }
    } else if (prevV0 && ev.previous_event_hash !== prevV0.event_hash) {
      push(ev, 'PREVIOUS_LINK_BROKEN', prevV0.event_hash, ev.previous_event_hash);
    }
    sawAnyV0 = true;
    prevV0 = ev;
  }

  return {
    company_id,
    events_scanned: events.length,
    ok: mismatches.length === 0,
    mismatches,
    path_tally,
    notes,
  };
}
