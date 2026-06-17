// Machine-readable verification contract — the payroll/downstream path.
//
// A payroll system that received the CSV (or any integrator) GETs the
// verify URL with `Accept: application/json` and ingests this shape to
// confirm the hours it is about to pay match the WLES-verified ledger.
// Stable and versioned: additive changes only within `wles_verification`
// major '1'.

import type { AuditPack } from './types';
import type { VerifyExportMeta } from './verify-pack';

export interface VerifyJson {
  wles_verification: '1';
  status: 'VERIFIED' | 'BROKEN';
  /** When this check re-ran against the ledger (live, not cached). */
  verified_at: string;
  verify_url: string;
  pay_period: { start: string; end: string };
  provider: string | null;
  file_hash: string;
  totals: { shifts: number; hours: number; events: number };
  broken_shift_ids: string[];
  shifts: Array<{
    receipt_id: string;
    worker_name: string;
    employee_id: string;
    date: string;
    hours: number;
    chain: 'VERIFIED' | 'BROKEN';
  }>;
  statement: string;
}

export function toVerifyJson(meta: VerifyExportMeta, pack: AuditPack, url: string): VerifyJson {
  const status = pack.hash_chain_integrity === 'VERIFIED' ? 'VERIFIED' : 'BROKEN';
  return {
    wles_verification: '1',
    status,
    verified_at: pack.generated_at,
    verify_url: url,
    pay_period: { start: meta.payPeriodStart, end: meta.payPeriodEnd },
    provider: meta.provider,
    file_hash: meta.fileHash,
    totals: {
      shifts: pack.total_shifts,
      hours: pack.total_hours,
      events: pack.total_events,
    },
    broken_shift_ids: pack.broken_chains,
    shifts: pack.shifts.map((s) => ({
      receipt_id: s.receipt_id,
      worker_name: s.worker_name,
      employee_id: s.worker_employee_id,
      date: s.shift_date,
      hours: s.total_hours,
      chain: s.hash_chain_valid ? 'VERIFIED' : 'BROKEN',
    })),
    statement:
      status === 'VERIFIED'
        ? 'Hours independently re-verified against the WLES SHA-256 hash-chain ledger at the time of this request. No tampering detected.'
        : 'One or more shift event chains failed verification against the WLES ledger. Do not pay these hours without review.',
  };
}
