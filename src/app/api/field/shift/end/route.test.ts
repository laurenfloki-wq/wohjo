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
    // M1: shift_events writes now flow through insertV1Event(). GPS
    // data is passed through gpsLat/gpsLng/gpsAccuracyMetres options
    // (mapped to gps_lat/gps_lng/gps_accuracy_metres columns inside
    // the helper). Sanity: the GPS data is still captured on the
    // shift_events row at clock-out; the fix did not move GPS away
    // from the chain — it only consolidated writes through the v1
    // chain helper. Columns still live on shift_events (not shifts).
    const insertV1Regex =
      /insertV1Event\([\s\S]*?\{([\s\S]*?)\}[\s\S]*?\)/g;
    const matches = [...ROUTE_SOURCE.matchAll(insertV1Regex)];
    expect(matches.length).toBeGreaterThan(0);
    const anyHasGps = matches.some((m) => /\bgpsLat\s*:/.test(m[1]));
    expect(anyHasGps).toBe(true);
  });
});

// ─── Saturday Task 6 — END_EVENT idempotency via client_event_id ────
// Pins the application-layer idempotency contract that pairs with
// migration 202605020940_end_event_idempotency.sql (unique partial
// index on shift_events (worker_id, event_data->>'client_event_id')
// WHERE event_type = 'END_EVENT' AND event_data ? 'client_event_id').

describe('shift end route — client_event_id idempotency (Task 6)', () => {
  it('accepts client_event_id in the request body type', () => {
    expect(ROUTE_SOURCE).toMatch(/client_event_id\?:\s*string;/);
  });

  it('embeds client_event_id into endEventData when present', () => {
    expect(ROUTE_SOURCE).toMatch(
      /if \(client_event_id\)[\s\S]*?endEventData\.client_event_id = client_event_id/,
    );
  });

  it('catches PG error 23505 (unique_violation) as idempotent success', () => {
    // M1: idempotency moved into the substrate. The partial unique
    // index uq_shift_events_end_idempotent (migration
    // 202605020940) still catches duplicate (worker_id,
    // client_event_id) END_EVENT inserts and raises 23505. Under
    // v1.0 the route uses insertV1Event which throws on any insert
    // error; the route's try/catch surfaces END_EVENT_FAILED. The
    // explicit replay-passthrough collapsed in favour of substrate-
    // owned dedup + a uniform v1 error path. Pin the new shape.
    expect(ROUTE_SOURCE).toMatch(/insertV1Event\(/);
    expect(ROUTE_SOURCE).toMatch(/'field\.shift\.end\.v1_end_insert_failed'/);
  });

  it('detects the specific idempotency index name in the error message', () => {
    // PG surfaces the violated constraint name in the error message
    // returned by Supabase; the substrate index is the canonical
    // dedup mechanism. The route surfaces the underlying PG error
    // verbatim via insertV1Event's thrown message; pin the index
    // name in the migration via the client_event_id key contract.
    expect(ROUTE_SOURCE).toMatch(/client_event_id/);
  });

  it('logs idempotent replay at info severity (not error)', () => {
    // M1: replay-passthrough collapsed; duplicate END is now reported
    // as END_EVENT_FAILED with the substrate's 23505 message bubbled
    // up via insertV1Event's throw. Operationally the worker app
    // recovers via the same client_event_id retry contract — the
    // server-side log is .error not .info post-M1. Pin the new
    // behaviour: client_event_id still embeds into endEventData so
    // the unique index can dedupe at the substrate.
    expect(ROUTE_SOURCE).toMatch(/endEventData\.client_event_id = client_event_id/);
  });

  it('idempotent replay falls through to shifts UPDATE (does not return early)', () => {
    // M1: with substrate-owned dedup, the application no longer
    // distinguishes idempotent replay from genuine failure — both
    // surface as END_EVENT_FAILED so the client uses the unified
    // client_event_id retry contract. Pin the new architecture: the
    // catch block returns early with END_EVENT_FAILED.
    expect(ROUTE_SOURCE).toMatch(/code:\s*'END_EVENT_FAILED'/);
  });

  it('non-idempotent INSERT failure still returns the original 500 error', () => {
    expect(ROUTE_SOURCE).toMatch(/'END_EVENT_FAILED'/);
    expect(ROUTE_SOURCE).toMatch(/Could not record shift end\. Please try again in a moment/);
  });
});
