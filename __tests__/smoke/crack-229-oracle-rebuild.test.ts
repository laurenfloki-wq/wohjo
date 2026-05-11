// CRACK 229 — end-to-end smoke against the actual production
// export_id f1e220dc-e42a-4830-8a9a-43b877dd5aed.
//
// The "real" smoke is the rebuild script at
// scripts/rebuild-export-csv.ts which Lauren can run with prod env
// vars. This test exercises the same logic with the MCP-fetched
// fixture so the path is provably correct without requiring env
// vars in CI.
//
// Fixture data is the live state of the 4 EXPORTED shifts as of
// 2026-05-11 14:00 AEST (queried via Supabase MCP). worker_id =
// Joao Muniz Campos (employee_id=EMP-FLOSMOSIS-TEST-JOAO, myob_card_id=null).
// tenant_activity_mappings is empty for company 00000000-1000-...

import { describe, it, expect } from 'vitest';
import { MYOBExporter, type MyobShift, type ActivityMapping } from '@/lib/exporters/myob';

const TAB = '\t';
const CRLF = '\r\n';

// ─── Fixture: live substrate state for export_id f1e220dc ─────────
// Sorted ascending by shift_date — matches the rebuild script.
const PROD_SHIFTS: Array<{
  shift_date: string;
  total_hours: string;
  receipt_id: string;
  workers: { employee_id: string; myob_card_id: string | null };
}> = [
  {
    shift_date: '2026-05-01',
    total_hours: '8.21',
    receipt_id: 'FSTR-J42SACCX',
    workers: { employee_id: 'EMP-FLOSMOSIS-TEST-JOAO', myob_card_id: null },
  },
  {
    shift_date: '2026-05-05',
    total_hours: '6.94',
    receipt_id: 'FSTR-JRYMJXWR',
    workers: { employee_id: 'EMP-FLOSMOSIS-TEST-JOAO', myob_card_id: null },
  },
  {
    shift_date: '2026-05-06',
    total_hours: '0.34',
    receipt_id: 'FSTR-UVD4DZ9N',
    workers: { employee_id: 'EMP-FLOSMOSIS-TEST-JOAO', myob_card_id: null },
  },
  {
    shift_date: '2026-05-08',
    total_hours: '4.81',
    receipt_id: 'FSTR-KMQ6479Q',
    workers: { employee_id: 'EMP-FLOSMOSIS-TEST-JOAO', myob_card_id: null },
  },
];

const PROD_MAPPINGS: ActivityMapping[] = []; // verified empty in prod

const EXPECTED_ORACLE =
  [
    ['Date', 'Card ID', 'Activity ID', 'Units'].join(TAB),
    ['2026-05-01', 'EMP-FLOSMOSIS-TEST-JOAO', 'LABOUR', '8.21'].join(TAB),
    ['2026-05-05', 'EMP-FLOSMOSIS-TEST-JOAO', 'LABOUR', '6.94'].join(TAB),
    ['2026-05-06', 'EMP-FLOSMOSIS-TEST-JOAO', 'LABOUR', '0.34'].join(TAB),
    ['2026-05-08', 'EMP-FLOSMOSIS-TEST-JOAO', 'LABOUR', '4.81'].join(TAB),
  ].join(CRLF) + CRLF;

describe('CRACK 229 — rebuild oracle (export_id f1e220dc-e42a-4830-8a9a-43b877dd5aed)', () => {
  it('rebuilt CSV matches Lauren-provided oracle verbatim', () => {
    // Project shifts → MyobShift records (same projection as the rebuild script
    // and as the post-CRACK-229 /api/exports/myob route).
    const myobShifts: MyobShift[] = PROD_SHIFTS.map((s) => ({
      card_id: s.workers.myob_card_id?.trim() || s.workers.employee_id?.trim() || '',
      shift_date: s.shift_date,
      category: 'ordinary_hours',
      units: parseFloat(s.total_hours),
    }));

    const exporter = new MYOBExporter();
    const result = exporter.format(myobShifts, PROD_MAPPINGS, {
      includeMarker: false,
      dateFormat: 'YYYY-MM-DD',
      defaultActivityId: 'LABOUR',
    });

    expect(result.rowCount).toBe(4);
    expect(result.warnings).toEqual([]);
    expect(result.body).toBe(EXPECTED_ORACLE);
  });

  it('rebuilt CSV total units sum to 20.30 (matches exports.total_hours)', () => {
    const myobShifts: MyobShift[] = PROD_SHIFTS.map((s) => ({
      card_id: s.workers.myob_card_id?.trim() || s.workers.employee_id?.trim() || '',
      shift_date: s.shift_date,
      category: 'ordinary_hours',
      units: parseFloat(s.total_hours),
    }));
    const exporter = new MYOBExporter();
    const result = exporter.format(myobShifts, PROD_MAPPINGS, {
      includeMarker: false,
      dateFormat: 'YYYY-MM-DD',
      defaultActivityId: 'LABOUR',
    });

    const dataLines = result.body
      .split(CRLF)
      .filter((l) => l.length > 0)
      .slice(1);
    const sum = dataLines.reduce((acc, line) => acc + parseFloat(line.split(TAB)[3]), 0);
    expect(sum).toBeCloseTo(20.3, 2);
  });

  it('rebuilt CSV has no {} marker prefix anywhere', () => {
    const myobShifts: MyobShift[] = PROD_SHIFTS.map((s) => ({
      card_id: s.workers.myob_card_id?.trim() || s.workers.employee_id?.trim() || '',
      shift_date: s.shift_date,
      category: 'ordinary_hours',
      units: parseFloat(s.total_hours),
    }));
    const exporter = new MYOBExporter();
    const result = exporter.format(myobShifts, PROD_MAPPINGS, {
      includeMarker: false,
      dateFormat: 'YYYY-MM-DD',
      defaultActivityId: 'LABOUR',
    });

    expect(result.body).not.toContain('{}');
  });
});
