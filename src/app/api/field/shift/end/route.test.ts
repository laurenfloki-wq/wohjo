// Schema-drift guard for the shifts UPDATE in
// src/app/api/field/shift/end/route.ts.
//
// 2026-05-01 ~3pm AEST — Joao E2E test surfaced a route bug: the
// shifts UPDATE was writing gps_lat / gps_lng / gps_accuracy_metres
// (columns that exist on shift_events but NOT on shifts). The UPDATE
// failed silently while the END_EVENT INSERT succeeded, leaving the
// worker stuck on "Couldn't save your end-of-shift" while data was
// already partially recorded.
//
// This test pins the route's UPDATE column set against the production
// shifts schema. Pattern follows the supervisors route schema-drift
// guard from commit 4f97f6a.
//
// Production shifts table columns per information_schema.columns
// query 2026-05-01:
//
//   id, company_id, worker_id, site_id, shift_date,
//   start_time, end_time, break_minutes, total_hours,
//   receipt_id, status, confidence_score, anomaly_flags,
//   supervisor_approved_by, supervisor_approved_at,
//   payroll_approved_by, payroll_approved_at, export_id,
//   worker_note, created_at, updated_at,
//   geofence_detected_at, geofence_lat, geofence_lng,
//   geofence_accuracy_metres, geofence_confidence,
//   worker_confirmed_start_at, start_time_source

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTE_SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/field/shift/end/route.ts'),
  'utf-8',
);

const PRODUCTION_SHIFTS_COLUMNS = new Set([
  'id',
  'company_id',
  'worker_id',
  'site_id',
  'shift_date',
  'start_time',
  'end_time',
  'break_minutes',
  'total_hours',
  'receipt_id',
  'status',
  'confidence_score',
  'anomaly_flags',
  'supervisor_approved_by',
  'supervisor_approved_at',
  'payroll_approved_by',
  'payroll_approved_at',
  'export_id',
  'worker_note',
  'created_at',
  'updated_at',
  'geofence_detected_at',
  'geofence_lat',
  'geofence_lng',
  'geofence_accuracy_metres',
  'geofence_confidence',
  'worker_confirmed_start_at',
  'start_time_source',
]);

describe('shift end route — shifts UPDATE schema-drift guard', () => {
  it('does not write gps_lat / gps_lng / gps_accuracy_metres to the shifts row', () => {
    // Match `.from('shifts').update({ ... })` blocks specifically (not
    // shift_events INSERTs which legitimately include gps_*).
    const shiftsUpdateRegex =
      /\.from\(['"]shifts['"]\)\s*\n?\s*\.update\(\{([\s\S]*?)\}\)/g;
    const matches = [...ROUTE_SOURCE.matchAll(shiftsUpdateRegex)];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      const body = match[1];
      // Pin the original bug: these three columns must NEVER appear
      // in a shifts UPDATE because they don't exist on the shifts table.
      expect(body).not.toMatch(/\bgps_lat\s*:/);
      expect(body).not.toMatch(/\bgps_lng\s*:/);
      expect(body).not.toMatch(/\bgps_accuracy_metres\s*:/);
    }
  });

  it('shifts UPDATE only writes columns that exist on the production schema', () => {
    const shiftsUpdateRegex =
      /\.from\(['"]shifts['"]\)\s*\n?\s*\.update\(\{([\s\S]*?)\}\)/g;
    const matches = [...ROUTE_SOURCE.matchAll(shiftsUpdateRegex)];
    expect(matches.length).toBeGreaterThan(0);

    // Extract the set of column keys the route writes. Each entry is
    // typically `column_name: <value>,`. Pull the column_name from the
    // start of each line within the update body.
    const columnRegex = /^\s*([a-z_]+)\s*:/gm;

    for (const match of matches) {
      const body = match[1];
      const columns = [...body.matchAll(columnRegex)].map((m) => m[1]);
      expect(columns.length).toBeGreaterThan(0);
      for (const col of columns) {
        expect(
          PRODUCTION_SHIFTS_COLUMNS.has(col),
          `shifts UPDATE writes column "${col}" which is NOT on the production shifts schema`,
        ).toBe(true);
      }
    }
  });

  it('END_EVENT INSERT into shift_events still records gps_lat / gps_lng / gps_accuracy_metres', () => {
    // Sanity: the GPS data is correctly captured on the shift_events
    // row INSERT (where those columns DO exist). The fix did not move
    // GPS data away from the chain — only stopped duplicating it onto
    // the shifts aggregate row where the columns don't exist.
    const shiftEventsInsertRegex =
      /\.from\(['"]shift_events['"]\)\s*\.insert\(\{([\s\S]*?)\}\)/g;
    const matches = [...ROUTE_SOURCE.matchAll(shiftEventsInsertRegex)];
    expect(matches.length).toBeGreaterThan(0);
    // At least one shift_events INSERT in this route includes GPS.
    const anyHasGps = matches.some((m) => /\bgps_lat\s*:/.test(m[1]));
    expect(anyHasGps).toBe(true);
  });
});
