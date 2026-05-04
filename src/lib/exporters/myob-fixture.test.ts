// MYOB exporter — byte-for-byte fixture integration test.
//
// Pins the exporter's output against
// src/test/fixtures/myob-dass-pay-period.txt — the canonical
// reference file mirroring Joao's payslip structure with placeholder
// Dass MYOB activity IDs (CW2-ORD, CW2-OT15, TRAVEL, MEAL, CW2-INCL,
// CW2-MS, CW2-RDO).
//
// SUBSTRATE-DD POSTURE: byte-for-byte assertion is the right standard
// for a TSV file MYOB will parse character-by-character. A drifted
// byte (extra space, wrong line ending, rearranged column order) is
// the difference between a clean import and a manual-fix-required
// failure on Mo's pay run.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MYOBExporter,
  type ActivityMapping,
  type MyobShift,
} from './myob';

const FIXTURE_PATH = 'src/test/fixtures/myob-dass-pay-period.txt';
const FIXTURE_BODY = readFileSync(
  join(process.cwd(), FIXTURE_PATH),
  'utf-8',
);

const DASS_MAPPINGS: ActivityMapping[] = [
  { flostruction_category: 'ordinary_hours', myob_activity_id: 'CW2-ORD' },
  { flostruction_category: 'overtime_1_5x', myob_activity_id: 'CW2-OT15' },
  { flostruction_category: 'rdo_deductions_cw2', myob_activity_id: 'CW2-RDO' },
  { flostruction_category: 'travel_allowance', myob_activity_id: 'TRAVEL' },
  { flostruction_category: 'meal_allowance', myob_activity_id: 'MEAL' },
  { flostruction_category: 'inclement_weather_cw2', myob_activity_id: 'CW2-INCL' },
  { flostruction_category: 'multi_storey_allowance', myob_activity_id: 'CW2-MS' },
];

// 9 shifts mirroring the fixture — one Joao pay-period day with
// every category, one second worker with 7.5h ordinary, one Joao
// follow-up day with 8h ordinary.
const JOAO_PAY_PERIOD_SHIFTS: MyobShift[] = [
  { card_id: '*0001', shift_date: '2026-05-05', category: 'ordinary_hours', units: 8, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'overtime_1_5x', units: 2, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'travel_allowance', units: 1, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'meal_allowance', units: 1, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'inclement_weather_cw2', units: 0.5, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'multi_storey_allowance', units: 1, job: 'Stromlo Tunnel' },
  { card_id: '*0001', shift_date: '2026-05-05', category: 'rdo_deductions_cw2', units: -2, job: 'Stromlo Tunnel' },
  { card_id: '*0002', shift_date: '2026-05-06', category: 'ordinary_hours', units: 7.5, job: 'Weston Site' },
  { card_id: '*0001', shift_date: '2026-05-07', category: 'ordinary_hours', units: 8, job: 'Stromlo Tunnel' },
];

describe('MYOB fixture integration test', () => {
  it('byte-for-byte: exporter output matches src/test/fixtures/myob-dass-pay-period.txt', () => {
    const exporter = new MYOBExporter();
    const result = exporter.format(JOAO_PAY_PERIOD_SHIFTS, DASS_MAPPINGS);
    expect(result.warnings).toEqual([]);
    expect(result.rowCount).toBe(9);
    // The byte-for-byte assertion. If the fixture and the exporter
    // output diverge by a single character, this fails — and that's
    // exactly what we want (any drift is a Mo pay-run failure).
    expect(result.body).toBe(FIXTURE_BODY);
  });

  it('fixture is a non-empty TSV file (sanity check on the fixture itself)', () => {
    expect(FIXTURE_BODY.length).toBeGreaterThan(100);
    expect(FIXTURE_BODY.startsWith('{}')).toBe(true);
    expect(FIXTURE_BODY.includes('\r\n')).toBe(true);
    expect(FIXTURE_BODY.split('\r\n')[1].split('\t')[0]).toBe('Date');
  });

  it('fixture row count equals 9 + marker + header (12 lines including trailing CRLF)', () => {
    // marker (1) + header (1) + 9 data rows + trailing \r\n => 12
    // newline-terminated segments (last segment is the empty string
    // after the trailing \r\n).
    const segments = FIXTURE_BODY.split('\r\n');
    expect(segments.length).toBe(12);
    expect(segments[11]).toBe(''); // trailing empty segment
  });
});
