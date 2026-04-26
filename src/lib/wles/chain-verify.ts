// ---------------------------------------------------------------
// B5 — Hash chain daily verification
// Walks shift_events end-to-end per company and reports mismatches.
// Pure detection: does NOT mutate shift_events. Alerts are written
// to admin_access_log by the caller (the cron route).
// ---------------------------------------------------------------

import { generateEventHash } from './hash';

export interface ShiftEventRow {
  id: string;
  company_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  event_type: string;
  event_data: Record<string, unknown>;
  event_hash: string;
  previous_event_hash: string | null;
  created_at: string | Date;
}

export type MismatchReason =
  | 'SELF_HASH_MISMATCH'        // recomputed SHA-256 != stored event_hash
  | 'PREVIOUS_LINK_BROKEN'      // previous_event_hash != prior event's event_hash
  | 'GENESIS_LINK_INVALID';     // first event's previous_event_hash is neither null nor 'GENESIS'

export interface ChainMismatch {
  event_id: string;
  company_id: string | null;
  event_type: string;
  reason: MismatchReason;
  expected: string;
  actual: string;
  created_at: string;
}

export interface CompanyChainReport {
  company_id: string | null;
  events_scanned: number;
  ok: boolean;
  mismatches: ChainMismatch[];
}

function toIsoString(v: string | Date): string {
  return typeof v === 'string' ? v : v.toISOString();
}

function toDate(v: string | Date): Date {
  return typeof v === 'string' ? new Date(v) : v;
}

/**
 * Verify a single company's chain in chronological order.
 * Events MUST be pre-sorted by (created_at ASC, id ASC).
 *
 * We recompute every event's hash from its content plus compare
 * the previous_event_hash linkage. A single break produces a
 * mismatch record but scanning CONTINUES so downstream alerts
 * see the full extent of corruption.
 */
export function verifyCompanyChain(events: ShiftEventRow[]): CompanyChainReport {
  const mismatches: ChainMismatch[] = [];
  if (events.length === 0) {
    return { company_id: null, events_scanned: 0, ok: true, mismatches };
  }
  const company_id = events[0].company_id;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // 1. Self-hash check — recompute from content.
    const expectedSelf = generateEventHash({
      company_id: ev.company_id ?? '',
      worker_id: ev.worker_id ?? '',
      site_id: ev.site_id ?? '',
      event_type: ev.event_type,
      event_data: ev.event_data,
      created_at: toDate(ev.created_at),
    });
    if (ev.event_hash !== expectedSelf) {
      mismatches.push({
        event_id: ev.id,
        company_id: ev.company_id,
        event_type: ev.event_type,
        reason: 'SELF_HASH_MISMATCH',
        expected: expectedSelf,
        actual: ev.event_hash,
        created_at: toIsoString(ev.created_at),
      });
    }

    // 2. Chain linkage check.
    if (i === 0) {
      if (ev.previous_event_hash !== null && ev.previous_event_hash !== 'GENESIS') {
        mismatches.push({
          event_id: ev.id,
          company_id: ev.company_id,
          event_type: ev.event_type,
          reason: 'GENESIS_LINK_INVALID',
          expected: 'NULL or GENESIS',
          actual: ev.previous_event_hash ?? 'NULL',
          created_at: toIsoString(ev.created_at),
        });
      }
    } else {
      const prev = events[i - 1];
      if (ev.previous_event_hash !== prev.event_hash) {
        mismatches.push({
          event_id: ev.id,
          company_id: ev.company_id,
          event_type: ev.event_type,
          reason: 'PREVIOUS_LINK_BROKEN',
          expected: prev.event_hash,
          actual: ev.previous_event_hash ?? 'NULL',
          created_at: toIsoString(ev.created_at),
        });
      }
    }
  }

  return {
    company_id,
    events_scanned: events.length,
    ok: mismatches.length === 0,
    mismatches,
  };
}
