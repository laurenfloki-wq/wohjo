// MYOB AccountRight Timesheet Exporter — test battery
//
// Goals:
//   1. Format compliance: A1 marker, tab separation, row 2 headers,
//      row 3+ data rows, CRLF line endings.
//   2. Date format: DD/MM/YYYY for various edge cases.
//   3. Decimal hours: 2-decimal padding, negative values preserved.
//   4. Card ID resolution + missing-card-id surfacing.
//   5. Activity mapping resolution + missing-mapping surfacing.
//   6. Empty pay period.
//   7. Multi-worker, multi-day fixture.
//   8. Negative hours (RDO deductions).
//   9. Allowance / ordinary / overtime category resolution.
//   10. Optional column handling (Job, Notes, Start/Stop Time).
//
// Substrate-DD posture: every test pins behaviour visible to MYOB.
// A failing test means a MYOB import would reject the file or
// silently misimport rows — both are demo-blocking.

import { describe, it, expect } from 'vitest';
import {
  MYOBExporter,
  MYOB_MARKER,
  formatMyobDate,
  formatMyobUnits,
  formatMyobTime,
  type MyobShift,
  type ActivityMapping,
} from './myob';

const exporter = new MYOBExporter();

const TAB = '\t';
const CRLF = '\r\n';

const DASS_MAPPINGS: ActivityMapping[] = [
  { flostruction_category: 'ordinary_hours', myob_activity_id: 'CW2-ORD' },
  { flostruction_category: 'overtime_1_5x', myob_activity_id: 'CW2-OT15' },
  { flostruction_category: 'overtime_2x', myob_activity_id: 'CW2-OT2' },
  { flostruction_category: 'rdo_deductions_cw2', myob_activity_id: 'CW2-RDO' },
  { flostruction_category: 'travel_allowance', myob_activity_id: 'TRAVEL' },
  { flostruction_category: 'meal_allowance', myob_activity_id: 'MEAL' },
  { flostruction_category: 'inclement_weather_cw2', myob_activity_id: 'CW2-INCL' },
  { flostruction_category: 'multi_storey_allowance', myob_activity_id: 'CW2-MS' },
];

function joaoOrdinary(date: string, units: number, overrides: Partial<MyobShift> = {}): MyobShift {
  return {
    card_id: '*0001',
    shift_date: date,
    category: 'ordinary_hours',
    units,
    ...overrides,
  };
}

// ─── (1) Helper unit tests ────────────────────────────────────────

describe('formatMyobDate', () => {
  it('1. formats canonical date as DD/MM/YYYY', () => {
    expect(formatMyobDate('2026-05-12')).toBe('12/05/2026');
  });
  it('2. preserves single-digit month padding', () => {
    expect(formatMyobDate('2026-01-15')).toBe('15/01/2026');
  });
  it('3. preserves single-digit day padding', () => {
    expect(formatMyobDate('2026-12-03')).toBe('03/12/2026');
  });
  it('4. handles year boundary 2026-12-31', () => {
    expect(formatMyobDate('2026-12-31')).toBe('31/12/2026');
  });
  it('5. handles year boundary 2027-01-01', () => {
    expect(formatMyobDate('2027-01-01')).toBe('01/01/2027');
  });
  it('6. handles leap-day 2028-02-29', () => {
    expect(formatMyobDate('2028-02-29')).toBe('29/02/2028');
  });
  it('7. throws on malformed input (no leading zeros)', () => {
    expect(() => formatMyobDate('2026-5-1')).toThrow(/Invalid date format/);
  });
  it('8. throws on empty input', () => {
    expect(() => formatMyobDate('')).toThrow(/Invalid date format/);
  });
});

describe('formatMyobUnits', () => {
  it('9. formats whole hours as N.00', () => {
    expect(formatMyobUnits(8)).toBe('8.00');
  });
  it('10. formats half hours as N.50', () => {
    expect(formatMyobUnits(7.5)).toBe('7.50');
  });
  it('11. formats decimal precision (always exactly 2dp via toFixed)', () => {
    // JS toFixed uses banker's rounding for .5 ties; substrate-DD pin:
    // we accept either 7.55 or 7.56 as long as exactly 2 decimals are
    // emitted. MYOB accepts both — the substrate-DD-relevant invariant
    // is the 2-decimal width, not the tie-break direction.
    const out = formatMyobUnits(7.555);
    expect(out).toMatch(/^7\.\d{2}$/);
    // Pin the actual JS behaviour so a future migration off toFixed
    // (e.g. to a 5/4 round-half-up implementation) is a deliberate,
    // visible change.
    expect(out).toBe('7.55');
  });
  it('11b. formats 7.554 as 7.55 (rounds down)', () => {
    expect(formatMyobUnits(7.554)).toBe('7.55');
  });
  it('11c. formats 7.556 as 7.56 (rounds up)', () => {
    expect(formatMyobUnits(7.556)).toBe('7.56');
  });
  it('12. preserves negative units (RDO deductions)', () => {
    expect(formatMyobUnits(-2)).toBe('-2.00');
  });
  it('13. preserves negative half-hour decimals', () => {
    expect(formatMyobUnits(-1.5)).toBe('-1.50');
  });
  it('14. formats zero as 0.00', () => {
    expect(formatMyobUnits(0)).toBe('0.00');
  });
  it('15. throws on NaN', () => {
    expect(() => formatMyobUnits(NaN)).toThrow(/Invalid units/);
  });
  it('16. throws on Infinity', () => {
    expect(() => formatMyobUnits(Infinity)).toThrow(/Invalid units/);
  });
});

describe('formatMyobTime', () => {
  it('17. extracts HH:MM from canonical ISO', () => {
    expect(formatMyobTime('2026-05-12T07:00:00.000Z')).toBe('07:00');
  });
  it('18. extracts HH:MM at midnight', () => {
    expect(formatMyobTime('2026-05-12T00:00:00.000+10:00')).toBe('00:00');
  });
  it('19. extracts HH:MM at end-of-day boundary', () => {
    expect(formatMyobTime('2026-05-12T23:59:00.000Z')).toBe('23:59');
  });
  it('20. throws on missing T separator', () => {
    expect(() => formatMyobTime('2026-05-12 07:00:00')).toThrow(/Invalid ISO/);
  });
});

// ─── (2) Format compliance ────────────────────────────────────────

describe('MYOBExporter.format — format compliance', () => {
  const single = exporter.format(
    [joaoOrdinary('2026-05-05', 8)],
    DASS_MAPPINGS,
  );

  it('21. cell A1 is the literal MYOB marker {}', () => {
    const firstLine = single.body.split(CRLF)[0];
    expect(firstLine).toBe(MYOB_MARKER);
  });

  it('22. row 2 starts with the canonical Date column header', () => {
    const lines = single.body.split(CRLF);
    expect(lines[1].split(TAB)[0]).toBe('Date');
  });

  it('23. row 2 mandatory column order is Date / Card ID / Activity ID / Units', () => {
    const lines = single.body.split(CRLF);
    const cols = lines[1].split(TAB);
    expect(cols.slice(0, 4)).toEqual(['Date', 'Card ID', 'Activity ID', 'Units']);
  });

  it('24. row 3 begins data (the first shift row)', () => {
    const lines = single.body.split(CRLF);
    const cols = lines[2].split(TAB);
    expect(cols[0]).toBe('05/05/2026'); // Date
  });

  it('25. fields are TAB-separated, not comma-separated', () => {
    expect(single.body).not.toContain(',');
    expect(single.body).toContain(TAB);
  });

  it('26. line endings are CRLF (Windows style)', () => {
    expect(single.body).toContain(CRLF);
    // No bare LF should appear that isn't part of a CRLF pair.
    const bareLf = single.body.replace(/\r\n/g, '').includes('\n');
    expect(bareLf).toBe(false);
  });

  it('27. file ends with CRLF (line terminator on last row)', () => {
    expect(single.body.endsWith(CRLF)).toBe(true);
  });

  it('28. data row tab count matches header tab count', () => {
    const lines = single.body.split(CRLF);
    const headerCount = (lines[1].match(/\t/g) ?? []).length;
    const dataCount = (lines[2].match(/\t/g) ?? []).length;
    expect(dataCount).toBe(headerCount);
  });
});

// ─── (3) Date / Units / Card ID rendering ─────────────────────────

describe('MYOBExporter.format — date rendering', () => {
  it('29. emits DD/MM/YYYY for canonical date', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-12', 8)],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('12/05/2026');
  });

  it('30. emits DD/MM/YYYY for single-digit day boundary', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-01-01', 8)],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('01/01/2026');
  });

  it('31. emits DD/MM/YYYY for end-of-year boundary', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-12-31', 8)],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('31/12/2026');
  });

  it('32. throws on shift with malformed date', () => {
    expect(() =>
      exporter.format([joaoOrdinary('not-a-date', 8)], DASS_MAPPINGS),
    ).toThrow(/Invalid date format/);
  });
});

describe('MYOBExporter.format — units rendering', () => {
  it('33. emits 8.00 for an 8-hour shift', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[3]).toBe('8.00');
  });

  it('34. emits 7.50 for a 7.5-hour shift', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 7.5)],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('7.50');
  });

  it('35. emits negative units for RDO deductions', () => {
    const result = exporter.format(
      [
        {
          card_id: '*0001',
          shift_date: '2026-05-05',
          category: 'rdo_deductions_cw2',
          units: -2,
        },
      ],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[3]).toBe('-2.00');
  });

  it('36. emits 0.00 for a zero-unit allowance row', () => {
    // Some allowances are flat dollars, not hours. MYOB still wants
    // a units column; the convention is 0.00 (or 1.00 for "one
    // claim"). We pin 0.00 → 0.00 verbatim — no special behaviour.
    const result = exporter.format(
      [
        {
          card_id: '*0001',
          shift_date: '2026-05-05',
          category: 'travel_allowance',
          units: 0,
        },
      ],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('0.00');
  });
});

describe('MYOBExporter.format — Card ID resolution', () => {
  it('37. emits worker.myob_card_id verbatim in the Card ID column', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[1]).toBe('*0001');
  });

  it('38. SKIPS shifts with empty card_id and surfaces an EMPTY_CARD_ID warning', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { card_id: '' })],
      DASS_MAPPINGS,
    );
    expect(result.rowCount).toBe(0);
    expect(result.warnings).toEqual([
      {
        shift_date: '2026-05-05',
        card_id: '',
        category: 'ordinary_hours',
        reason: 'EMPTY_CARD_ID',
      },
    ]);
  });

  it('39. trims whitespace-padded card_id before emitting', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { card_id: '  *0001  ' })],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[1]).toBe('*0001');
  });
});

// ─── (4) Activity mapping ─────────────────────────────────────────

describe('MYOBExporter.format — activity mapping resolution', () => {
  it('40. resolves ordinary_hours → CW2-ORD via mappings', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[2]).toBe('CW2-ORD');
  });

  it('41. resolves overtime_1_5x → CW2-OT15', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 2, { category: 'overtime_1_5x' })],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('CW2-OT15');
  });

  it('42. resolves travel_allowance → TRAVEL', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 1, { category: 'travel_allowance' })],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('TRAVEL');
  });

  it('43. resolves multi_storey_allowance → CW2-MS', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 1, { category: 'multi_storey_allowance' })],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('CW2-MS');
  });

  it('44. SKIPS shifts with no mapping and surfaces NO_MAPPING warning', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 1, { category: 'unknown_category' })],
      DASS_MAPPINGS,
    );
    expect(result.rowCount).toBe(0);
    expect(result.warnings).toEqual([
      {
        shift_date: '2026-05-05',
        card_id: '*0001',
        category: 'unknown_category',
        reason: 'NO_MAPPING',
      },
    ]);
  });

  it('45. SKIPS shifts whose mapping resolves to an empty activity_id (EMPTY_ACTIVITY_ID warning)', () => {
    const partial: ActivityMapping[] = [
      { flostruction_category: 'ordinary_hours', myob_activity_id: '   ' },
    ];
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      partial,
    );
    expect(result.rowCount).toBe(0);
    expect(result.warnings[0].reason).toBe('EMPTY_ACTIVITY_ID');
  });

  it('46. respects the LAST mapping when duplicates appear (deterministic precedence)', () => {
    const dupes: ActivityMapping[] = [
      { flostruction_category: 'ordinary_hours', myob_activity_id: 'OLD-ORD' },
      { flostruction_category: 'ordinary_hours', myob_activity_id: 'NEW-ORD' },
    ];
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      dupes,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[2]).toBe('NEW-ORD');
  });

  it('47. trims whitespace-padded category and activity_id keys', () => {
    const padded: ActivityMapping[] = [
      { flostruction_category: '  ordinary_hours  ', myob_activity_id: '  CW2-ORD  ' },
    ];
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      padded,
    );
    const lines = result.body.split(CRLF);
    expect(lines[2].split(TAB)[2]).toBe('CW2-ORD');
  });
});

// ─── (5) Empty / single / multi-row scenarios ─────────────────────

describe('MYOBExporter.format — row count scenarios', () => {
  it('48. empty shifts: emits marker + headers + zero data rows', () => {
    const result = exporter.format([], DASS_MAPPINGS);
    expect(result.rowCount).toBe(0);
    const lines = result.body.split(CRLF).filter((l) => l.length > 0);
    expect(lines.length).toBe(2); // marker + header
  });

  it('49. multi-worker, multi-day fixture produces N data rows', () => {
    const shifts: MyobShift[] = [
      { card_id: '*0001', shift_date: '2026-05-05', category: 'ordinary_hours', units: 8 },
      { card_id: '*0001', shift_date: '2026-05-06', category: 'ordinary_hours', units: 8 },
      { card_id: '*0002', shift_date: '2026-05-05', category: 'ordinary_hours', units: 7.5 },
      { card_id: '*0002', shift_date: '2026-05-06', category: 'overtime_1_5x', units: 2 },
    ];
    const result = exporter.format(shifts, DASS_MAPPINGS);
    expect(result.rowCount).toBe(4);
    expect(result.warnings).toEqual([]);
  });

  it('50. mixed-category Joao-style payslip pattern', () => {
    const shifts: MyobShift[] = [
      { card_id: '*0001', shift_date: '2026-05-05', category: 'ordinary_hours', units: 38 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'overtime_1_5x', units: 5 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'rdo_deductions_cw2', units: -2 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'travel_allowance', units: 1 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'meal_allowance', units: 1 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'inclement_weather_cw2', units: 0.5 },
      { card_id: '*0001', shift_date: '2026-05-05', category: 'multi_storey_allowance', units: 1 },
    ];
    const result = exporter.format(shifts, DASS_MAPPINGS);
    expect(result.rowCount).toBe(7);
    expect(result.warnings).toEqual([]);
    // Verify each Activity ID is present in output
    expect(result.body).toContain('CW2-ORD');
    expect(result.body).toContain('CW2-OT15');
    expect(result.body).toContain('CW2-RDO');
    expect(result.body).toContain('TRAVEL');
    expect(result.body).toContain('MEAL');
    expect(result.body).toContain('CW2-INCL');
    expect(result.body).toContain('CW2-MS');
  });

  it('51. partial-failure batch: included rows pass, skipped rows surfaced', () => {
    const shifts: MyobShift[] = [
      { card_id: '*0001', shift_date: '2026-05-05', category: 'ordinary_hours', units: 8 },
      { card_id: '', shift_date: '2026-05-05', category: 'ordinary_hours', units: 8 }, // skip
      { card_id: '*0002', shift_date: '2026-05-05', category: 'unknown_cat', units: 8 }, // skip
    ];
    const result = exporter.format(shifts, DASS_MAPPINGS);
    expect(result.rowCount).toBe(1);
    expect(result.warnings.length).toBe(2);
    expect(result.warnings.map((w) => w.reason).sort()).toEqual([
      'EMPTY_CARD_ID',
      'NO_MAPPING',
    ]);
  });
});

// ─── (6) Optional column handling ─────────────────────────────────

describe('MYOBExporter.format — optional columns', () => {
  it('52. Job column appears when at least one shift supplies job', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { job: 'STROM-01' })],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[1].split(TAB)).toContain('Job');
    expect(lines[2].split(TAB)).toContain('STROM-01');
  });

  it('53. Job column is OMITTED when no shift supplies job', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[1].split(TAB)).not.toContain('Job');
  });

  it('54. Notes column appears when at least one shift supplies notes', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { notes: 'late return — site lockout' })],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('Notes');
    expect(result.body).toContain('late return — site lockout');
  });

  it('55. Notes column strips tab characters (TSV format integrity)', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { notes: 'tab\there' })],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    const headerCount = (lines[1].match(/\t/g) ?? []).length;
    const dataCount = (lines[2].match(/\t/g) ?? []).length;
    expect(dataCount).toBe(headerCount);
    expect(result.body).toContain('tab here');
  });

  it('56. Notes column strips newline characters', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { notes: 'line1\nline2' })],
      DASS_MAPPINGS,
    );
    expect(result.body).toContain('line1 line2');
    expect(result.body).not.toContain('line1\nline2');
  });

  it('57. Start Time + Stop Time columns appear when supplied', () => {
    const result = exporter.format(
      [
        joaoOrdinary('2026-05-05', 8, {
          start_time: '2026-05-05T07:00:00.000+10:00',
          stop_time: '2026-05-05T15:30:00.000+10:00',
        }),
      ],
      DASS_MAPPINGS,
    );
    const lines = result.body.split(CRLF);
    expect(lines[1].split(TAB)).toContain('Start Time');
    expect(lines[1].split(TAB)).toContain('Stop Time');
    expect(result.body).toContain('07:00');
    expect(result.body).toContain('15:30');
  });

  it('58. Start/Stop Time columns are OMITTED when no shift supplies them', () => {
    const result = exporter.format(
      [joaoOrdinary('2026-05-05', 8)],
      DASS_MAPPINGS,
    );
    expect(result.body).not.toContain('Start Time');
    expect(result.body).not.toContain('Stop Time');
  });
});

// ─── (7) Tenant scoping invariant ─────────────────────────────────

describe('MYOBExporter.format — tenant scoping invariant', () => {
  it('59. mappings from tenant A do NOT leak into tenant B export', () => {
    // Conceptually: each format() call receives its OWN mappings
    // array. The exporter has no shared state. This test pins that
    // invariant by re-using the same exporter instance with two
    // different tenant mapping sets and asserting outputs differ.
    const tenantA: ActivityMapping[] = [
      { flostruction_category: 'ordinary_hours', myob_activity_id: 'A-ORD' },
    ];
    const tenantB: ActivityMapping[] = [
      { flostruction_category: 'ordinary_hours', myob_activity_id: 'B-ORD' },
    ];
    const shift = joaoOrdinary('2026-05-05', 8);
    const a = exporter.format([shift], tenantA);
    const b = exporter.format([shift], tenantB);
    expect(a.body).toContain('A-ORD');
    expect(a.body).not.toContain('B-ORD');
    expect(b.body).toContain('B-ORD');
    expect(b.body).not.toContain('A-ORD');
  });

  it('60. exporter has no shared state — second call is not contaminated by first', () => {
    const r1 = exporter.format(
      [joaoOrdinary('2026-05-05', 8, { job: 'STROM-01' })],
      DASS_MAPPINGS,
    );
    const r2 = exporter.format(
      [joaoOrdinary('2026-05-06', 8)],
      DASS_MAPPINGS,
    );
    expect(r1.body).toContain('Job');
    // r2 has NO job-supplied shifts → Job column must NOT appear.
    expect(r2.body).not.toContain('Job');
  });
});
