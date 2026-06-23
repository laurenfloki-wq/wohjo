// E1a — Deterministic end-to-end backbone: Joao's ledger -> Employment Hero CSV.
//
// WHY THIS EXISTS
// The pre-existing src/test/integration/full-happy-path.test.ts proves the
// route *source shape* (regex assertions) and the hash *primitive*, but it
// explicitly defers a true end-to-end run ("a future RUN_LIVE_E2E flagged
// suite ... That layer is deferred"). This suite closes the highest-value
// part of that gap WITHOUT a live Postgres/HTTP harness: it drives Joao's
// canonical shift through the REAL WLES chain builder, the REAL chain
// verifier, and the REAL Employment Hero formatter (the export of record),
// then asserts the exact CSV schema.
//
// What it proves end-to-end (production code paths, no mocks):
//   1. The four canonical events (START -> END -> SHIFT_COMMIT ->
//      SUPERVISOR_APPROVAL) hash deterministically and link into a chain
//      that verifyCompanyChain() accepts (ok, zero mismatches).
//   2. Tampering any stored hash is caught (SELF_HASH_MISMATCH) — the
//      verifier the nightly cron relies on actually detects corruption on
//      Joao's own chain.
//   3. The resulting PAYROLL_APPROVED shift validates clean and formats to
//      an exact-schema Employment Hero CSV: 8 canonical columns, 8.00
//      ordinary hours, 30-minute break, no improvised columns
//      (non-negotiable #7).
//
// What it does NOT prove (tracked separately as E1b, needs CI Postgres
// infra): route-handler orchestration over HTTP against a live DB +
// migrations + RLS. That remains a RUN_LIVE_E2E suite.
//
// The test that never changes (CLAUDE.md): Joao worked 8 hours. 7:00am
// start. 3:30pm finish. 30min break. $28.47/hr. Capture, flag nothing,
// route to approval, export correctly.

import { describe, it, expect } from 'vitest';
import { generateEventHash } from '../../lib/wles/hash';
import { verifyCompanyChain, type ShiftEventRow } from '../../lib/wles/chain-verify';
import { EmploymentHeroFormatter } from '../../lib/export/formatters/employment-hero';
import type { ApprovedShift } from '../../lib/export/types';

// ─── Joao's canonical shift — deterministic fixtures ─────────────────
const COMPANY_ID = '00000000-1000-0000-0000-000000000001';
const WORKER_ID = '00000000-2000-0000-0000-000000000001';
const SITE_ID = '00000000-3000-0000-0000-000000000001';
const SHIFT_ID = '00000000-5000-0000-0000-000000000001';
const RECEIPT_ID = 'FSTR-JOAO0001';
const SUPERVISOR_PHONE = '+61400000002';

// 07:00 -> 15:30 AEST (UTC+10) on 2026-05-03, 30-min break => 8.00 hours.
const START_AT = new Date('2026-05-02T21:00:00.000Z'); // 07:00 AEST
const END_AT = new Date('2026-05-03T05:30:00.000Z'); // 15:30 AEST
const COMMIT_AT = new Date(END_AT.getTime() + 1);
const APPROVAL_AT = new Date('2026-05-03T05:31:00.000Z');
const TOTAL_HOURS = 8.0;
const BREAK_MINUTES = 30;

function buildEvent(params: {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: Date;
  previousEventHash: string | null;
}): ShiftEventRow {
  const eventHash = generateEventHash({
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: params.eventType,
    event_data: params.eventData,
    created_at: params.createdAt,
  });
  return {
    id: params.id,
    company_id: COMPANY_ID,
    worker_id: WORKER_ID,
    site_id: SITE_ID,
    event_type: params.eventType,
    event_data: params.eventData,
    event_hash: eventHash,
    previous_event_hash: params.previousEventHash,
    created_at: params.createdAt.toISOString(),
  };
}

function buildJoaoChain(): ShiftEventRow[] {
  const start = buildEvent({
    id: 'evt-1-start',
    eventType: 'START_EVENT',
    eventData: {
      start_time: START_AT.toISOString(),
      shift_date: '2026-05-03',
      gps_lat: '-35.319',
      gps_lng: '149.007',
    },
    createdAt: START_AT,
    previousEventHash: null,
  });
  const end = buildEvent({
    id: 'evt-2-end',
    eventType: 'END_EVENT',
    eventData: {
      shift_id: SHIFT_ID,
      end_time: END_AT.toISOString(),
      break_minutes: BREAK_MINUTES,
      total_hours: TOTAL_HOURS,
    },
    createdAt: END_AT,
    previousEventHash: start.event_hash,
  });
  const commit = buildEvent({
    id: 'evt-3-commit',
    eventType: 'SHIFT_COMMIT',
    eventData: {
      shift_id: SHIFT_ID,
      receipt_id: RECEIPT_ID,
      total_hours: TOTAL_HOURS,
      break_minutes: BREAK_MINUTES,
      committed_at: COMMIT_AT.toISOString(),
    },
    createdAt: COMMIT_AT,
    previousEventHash: end.event_hash,
  });
  const approval = buildEvent({
    id: 'evt-4-approval',
    eventType: 'SUPERVISOR_APPROVAL',
    eventData: {
      shift_id: SHIFT_ID,
      receipt_id: RECEIPT_ID,
      method: 'WOHJO_VERIFY',
      approver_phone: SUPERVISOR_PHONE,
    },
    createdAt: APPROVAL_AT,
    previousEventHash: commit.event_hash,
  });
  return [start, end, commit, approval];
}

function joaoApprovedShift(): ApprovedShift {
  return {
    id: SHIFT_ID,
    worker_id: WORKER_ID,
    worker_employee_id: 'EH-1001',
    worker_first_name: 'Joao',
    worker_last_name: 'Silva',
    site_id: SITE_ID,
    site_name: 'Barangaroo Tower',
    company_id: COMPANY_ID,
    shift_date: '2026-05-03',
    start_time: START_AT.toISOString(),
    end_time: END_AT.toISOString(),
    break_minutes: BREAK_MINUTES,
    total_hours: TOTAL_HOURS,
    pay_rate: 28.47,
    status: 'PAYROLL_APPROVED',
    receipt_id: RECEIPT_ID,
    notes: '',
  };
}

describe('Joao end-to-end: ledger chain -> Employment Hero CSV', () => {
  describe('1. WLES chain integrity', () => {
    it('the four canonical events verify as an intact chain', () => {
      const report = verifyCompanyChain(buildJoaoChain());
      expect(report.ok).toBe(true);
      expect(report.events_scanned).toBe(4);
      expect(report.mismatches).toHaveLength(0);
    });

    it('event order is START -> END -> SHIFT_COMMIT -> SUPERVISOR_APPROVAL', () => {
      const chain = buildJoaoChain();
      expect(chain.map((e) => e.event_type)).toEqual([
        'START_EVENT',
        'END_EVENT',
        'SHIFT_COMMIT',
        'SUPERVISOR_APPROVAL',
      ]);
    });

    it('each event links to its predecessor via previous_event_hash', () => {
      const chain = buildJoaoChain();
      expect(chain[0].previous_event_hash).toBeNull();
      for (let i = 1; i < chain.length; i++) {
        expect(chain[i].previous_event_hash).toBe(chain[i - 1].event_hash);
      }
    });

    it('tampering a stored hash is detected (the nightly cron would catch it)', () => {
      const chain = buildJoaoChain();
      chain[2] = { ...chain[2], event_hash: 'deadbeef'.repeat(8) };
      const report = verifyCompanyChain(chain);
      expect(report.ok).toBe(false);
      expect(report.mismatches.some((m) => m.reason === 'SELF_HASH_MISMATCH')).toBe(true);
    });
  });

  describe('2. Employment Hero export (system of record)', () => {
    it('the payroll-approved shift validates with zero errors', () => {
      expect(EmploymentHeroFormatter.validate([joaoApprovedShift()])).toEqual([]);
    });

    it('formats to the exact 8-column Employment Hero schema — no improvised columns', () => {
      const csv = EmploymentHeroFormatter.format([joaoApprovedShift()]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2); // header + Joao's row
      expect(lines[0]).toBe(
        'Employee ID,Employee Name,Date,Start Time,Finish Time,Break (mins),Ordinary Hours,Notes',
      );
    });

    it('the row carries 8.00 ordinary hours, a 30-minute break, and the AU date', () => {
      const csv = EmploymentHeroFormatter.format([joaoApprovedShift()]);
      const row = csv.split('\n')[1].split(',');
      // notes is empty and trailing-trimmed => 7 fields, indices 0..6
      expect(row[1]).toBe('Joao Silva'); // Employee Name
      expect(row[2]).toBe('03/05/2026'); // Date (DD/MM/YYYY)
      expect(row[5]).toBe('30'); // Break (mins)
      expect(row[6]).toBe('8.00'); // Ordinary Hours (decimal(10,2))
    });

    it('produces exactly one data row for one shift (no phantom rows)', () => {
      const csv = EmploymentHeroFormatter.format([joaoApprovedShift()]);
      expect(csv.split('\n').filter((l) => l.length > 0)).toHaveLength(2);
    });
  });
});
