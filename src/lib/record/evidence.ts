// Per-record evidence — independent re-verification.
//
// The product's blessed verification is the daily anchor recompute shown
// on the record page. This adds a per-record check: recompute the hash
// from the stored payload with the SAME generic function the Evidence
// Pack uses (generateEventHash), and report whether it reproduces the
// stored hash. A match is a genuine independent proof. A non-match means
// the event uses a typed hash scheme (e.g. SHIFT_COMMIT) — not a break —
// and the chain anchors remain the authority.

import { generateEventHash } from '@/lib/wles/hash';

export interface RecordEventRow {
  id: string;
  company_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  event_type: string;
  event_data: Record<string, unknown> | null;
  event_hash: string | null;
  previous_event_hash: string | null;
  created_at: string;
}

export interface EvidenceVerdict {
  recomputed: string;
  matches: boolean;
}

export function recomputeGenericHash(row: RecordEventRow): string {
  return generateEventHash({
    company_id: row.company_id ?? '',
    worker_id: row.worker_id ?? '',
    site_id: row.site_id ?? '',
    event_type: row.event_type,
    event_data: row.event_data ?? {},
    created_at: new Date(row.created_at),
  });
}

export function evidenceVerdict(row: RecordEventRow): EvidenceVerdict {
  const recomputed = recomputeGenericHash(row);
  return { recomputed, matches: row.event_hash !== null && recomputed === row.event_hash };
}

/** receipt_id carried in a record's payload, if any. */
export function receiptOf(eventData: Record<string, unknown> | null): string | null {
  const r = eventData?.['receipt_id'];
  return typeof r === 'string' ? r : null;
}
