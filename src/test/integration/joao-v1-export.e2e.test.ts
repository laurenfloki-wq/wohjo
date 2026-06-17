// E1c — WLES v1.0 end-to-end backbone: Joao's sealed ledger -> EXPORT_RECORD
// -> Employment Hero CSV.
//
// WHY THIS EXISTS
// The v0 sibling (joao-ledger-to-csv.e2e.test.ts) proves the LEGACY chain
// (generateEventHash + verifyCompanyChain). Production now seals WLES v1.0
// (sealEvent + the SPEC-AWARE verifier) and assembles a real export. This
// suite drives the SAME canonical shift through the REAL v1 builders, the
// REAL v1 seal, the REAL spec-aware verifier (the one the Evidence Pack and
// the nightly cron rely on — and the one a regression silently broke), the
// EXPORT_RECORD seal, and the EH formatter — deterministically, no DB.
//
// What it proves end-to-end (production code paths, no mocks):
//   1. Joao's canonical shift sealed as a v1.0 chain
//      (SHIFT_COMMIT -> CLOCK_IN -> CLOCK_OUT -> PAYROLL_APPROVAL ->
//      EXPORT_RECORD) verifies clean: every event V1_CANONICAL, genesis at
//      ZERO_HASH, each link intact.
//   2. The EXPORT_RECORD seals under the WLES type X-FLOSMOSIS-EXPORT_RECORD
//      while its substrate event_type stays the bare name (m0d) — and the
//      pack-verify kernel accepts it (the exact shape that once read BROKEN).
//   3. Tampering any sealed v1 payload is caught, flagging exactly that event.
//   4. The PAYROLL_APPROVED shift formats to the exact 8-column EH CSV:
//      8.00 ordinary hours, 30-minute break, AU date.
//
// The test that never changes (CLAUDE.md): Joao worked 8 hours. 7:00am
// start. 3:30pm finish. 30min break. $28.47/hr.

import { describe, it, expect } from 'vitest';
import { sealEvent } from '../../lib/wles/v1';
import { ZERO_HASH, type WlesEvent } from '../../lib/wles/v1-types';
import {
  buildShiftCommit,
  buildClockIn,
  buildClockOut,
  buildApproval,
  buildExportRecord,
} from '../../lib/wles/v1-translate';
import {
  verifyCompanyChainSpecAware,
  verifyEventSelfHashSpecAware,
  type ShiftEventRowSpecAware,
} from '../../lib/wles/chain-verify-spec-aware';
import { EmploymentHeroFormatter } from '../../lib/export/formatters/employment-hero';
import type { ApprovedShift } from '../../lib/export/types';

const COMPANY_ID = '00000000-1000-0000-0000-000000000001';
const WORKER_ID = '00000000-2000-0000-0000-000000000001';
const SITE_ID = '00000000-3000-0000-0000-000000000001';
const SHIFT_ID = '00000000-5000-0000-0000-000000000001';
const EXPORT_ID = '00000000-6000-0000-0000-000000000001';
const ADMIN_ID = '00000000-7000-0000-0000-000000000001';
const RECEIPT_ID = 'FSTR-JOAO0001';
const FILE_HASH = 'a'.repeat(64);

// 07:00 -> 15:30 AEST (UTC+10) on 2026-05-03, 30-min break => 8.00 hours.
const START = '2026-05-02T21:00:00.000Z';
const END = '2026-05-03T05:30:00.000Z';
const COMMIT_TS = '2026-05-03T05:30:00.100Z';
const APPROVAL_TS = '2026-05-03T05:31:00.000Z';
const EXPORT_TS = '2026-05-03T06:00:00.000Z';

/**
 * Build Joao's canonical shift as a sealed v1.0 chain, mapped to the
 * substrate row shape the spec-aware verifier consumes. The bare substrate
 * event_type (m0d) differs from the wles_event WLES type for the export.
 */
function buildJoaoV1Rows(): ShiftEventRowSpecAware[] {
  const rows: ShiftEventRowSpecAware[] = [];
  let prev = ZERO_HASH;
  let n = 0;
  const push = (sealed: WlesEvent, substrateType: string, data: Record<string, unknown>) => {
    rows.push({
      id: `evt-${++n}`,
      company_id: COMPANY_ID,
      worker_id: WORKER_ID,
      site_id: SITE_ID,
      event_type: substrateType,
      event_data: data,
      event_hash: sealed.event_hash,
      previous_event_hash: sealed.previous_event_hash,
      created_at: sealed.timestamp,
      spec_version: '1.0',
      wles_event: sealed,
    });
    prev = sealed.event_hash;
  };

  push(
    sealEvent(
      buildShiftCommit({
        actorId: WORKER_ID,
        subjectId: WORKER_ID,
        timestamp: COMMIT_TS,
        previousEventHash: prev,
        shiftId: SHIFT_ID,
        siteId: SITE_ID,
      }),
    ),
    'SHIFT_COMMIT',
    { shift_id: SHIFT_ID, receipt_id: RECEIPT_ID },
  );

  push(
    sealEvent(
      buildClockIn({
        actorId: WORKER_ID,
        subjectId: WORKER_ID,
        timestamp: START,
        previousEventHash: prev,
        shiftId: SHIFT_ID,
        siteId: SITE_ID,
        detectionMethod: 'geofence',
      }),
    ),
    'CLOCK_IN',
    { shift_id: SHIFT_ID },
  );

  push(
    sealEvent(
      buildClockOut({
        actorId: WORKER_ID,
        subjectId: WORKER_ID,
        timestamp: END,
        previousEventHash: prev,
        shiftId: SHIFT_ID,
        siteId: SITE_ID,
      }),
    ),
    'CLOCK_OUT',
    { shift_id: SHIFT_ID },
  );

  push(
    sealEvent(
      buildApproval({
        actorId: ADMIN_ID,
        subjectId: WORKER_ID,
        timestamp: APPROVAL_TS,
        previousEventHash: prev,
        shiftId: SHIFT_ID,
        approvedHours: 8.0,
        approvalMethod: 'web',
        layer: 'payroll',
      }),
    ),
    'PAYROLL_APPROVAL',
    { shift_id: SHIFT_ID, receipt_id: RECEIPT_ID },
  );

  push(
    sealEvent(
      buildExportRecord({
        actorId: ADMIN_ID,
        subjectId: WORKER_ID,
        timestamp: EXPORT_TS,
        previousEventHash: prev,
        shiftId: SHIFT_ID,
        exportId: EXPORT_ID,
        provider: 'employment_hero',
        fileHash: FILE_HASH,
      }),
    ),
    'EXPORT_RECORD',
    {
      shift_id: SHIFT_ID,
      receipt_id: RECEIPT_ID,
      export_id: EXPORT_ID,
      provider: 'employment_hero',
      file_hash: FILE_HASH,
    },
  );

  return rows;
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
    start_time: START,
    end_time: END,
    break_minutes: 30,
    total_hours: 8.0,
    pay_rate: 28.47,
    status: 'PAYROLL_APPROVED',
    receipt_id: RECEIPT_ID,
    notes: '',
  };
}

describe('Joao end-to-end (WLES v1.0): sealed ledger -> EXPORT_RECORD -> EH CSV', () => {
  describe('1. v1 chain integrity (spec-aware verifier)', () => {
    it('the sealed v1 chain verifies clean — all five events V1_CANONICAL', () => {
      const r = verifyCompanyChainSpecAware(buildJoaoV1Rows());
      expect(r.ok).toBe(true);
      expect(r.mismatches).toEqual([]);
      expect(r.events_scanned).toBe(5);
      expect(r.path_tally.V1_CANONICAL).toBe(5);
    });

    it('opens at genesis (ZERO_HASH) and links each event to its predecessor', () => {
      const rows = buildJoaoV1Rows();
      expect(rows[0].previous_event_hash).toBe(ZERO_HASH);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].previous_event_hash).toBe(rows[i - 1].event_hash);
      }
    });

    it('the EXPORT_RECORD seals as X-FLOSMOSIS-EXPORT_RECORD with a bare substrate name, and the pack-verify kernel accepts it', () => {
      const rows = buildJoaoV1Rows();
      const exp = rows[rows.length - 1];
      expect(exp.event_type).toBe('EXPORT_RECORD'); // substrate (m0d)
      expect((exp.wles_event as WlesEvent).event_type).toBe('X-FLOSMOSIS-EXPORT_RECORD');
      // The Evidence Pack's per-event kernel — the one that once read BROKEN.
      expect(verifyEventSelfHashSpecAware(exp)).toMatchObject({ ok: true, path: 'V1_CANONICAL' });
    });

    it('tampering the EXPORT_RECORD payload is caught — exactly that event', () => {
      const rows = buildJoaoV1Rows();
      const exp = rows[rows.length - 1];
      (exp.wles_event as WlesEvent).payload = {
        ...(exp.wles_event as WlesEvent).payload,
        file_hash: 'b'.repeat(64),
      };
      const r = verifyCompanyChainSpecAware(rows);
      expect(r.ok).toBe(false);
      const flagged = new Set(r.mismatches.map((m) => m.event_id));
      expect(flagged.has(exp.id)).toBe(true);
    });
  });

  describe('2. Employment Hero export (system of record)', () => {
    it('the approved shift validates and formats to the exact 8-column EH CSV', () => {
      expect(EmploymentHeroFormatter.validate([joaoApprovedShift()])).toEqual([]);
      const csv = EmploymentHeroFormatter.format([joaoApprovedShift()]);
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'Employee ID,Employee Name,Date,Start Time,Finish Time,Break (mins),Ordinary Hours,Notes',
      );
      const row = lines[1].split(',');
      expect(row[1]).toBe('Joao Silva'); // Employee Name
      expect(row[2]).toBe('03/05/2026'); // Date (DD/MM/YYYY)
      expect(row[5]).toBe('30'); // Break (mins)
      expect(row[6]).toBe('8.00'); // Ordinary Hours
    });
  });
});
