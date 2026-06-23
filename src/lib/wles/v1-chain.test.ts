// WLES v1.0 chain helpers — control-flow tests.
//
// Uses a minimal in-memory Supabase mock (no network, no PGlite).
// Full end-to-end integration against a real Postgres is exercised
// by scripts/wles-v1-e2e-simulation.mjs and the activation-day
// checklist's Stage 0.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getV1ChainTail,
  insertV1Event,
  createBridgeEvent,
  FLOSMOSIS_SYSTEM_ACTOR_ID,
} from './v1-chain';
import { sealEvent } from './v1';
import { buildClockIn, buildApproval } from './v1-translate';
import { ZERO_HASH } from './v1-types';

// ─── Minimal Supabase mock ────────────────────────────────────────────
// Mimics the subset of the Supabase client the chain helpers use.
// Captures inserts in an internal `rows` array and supports the
// specific query patterns the helpers exercise.

function makeMockSupabase(initialRows: Array<Record<string, any>> = []) {
  const rows = [...initialRows];

  function fromTable(table: string) {
    if (table !== 'shift_events') throw new Error(`unexpected table ${table}`);
    return {
      select: (_cols: string) => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) => ({
            order: (orderCol: string, _opts: { ascending: boolean }) => ({
              limit: (_n: number) => ({
                maybeSingle: async () => {
                  const matched = rows
                    .filter((r) => r[col1] === val1 && r[col2] === val2)
                    .sort((a, b) => (a[orderCol] < b[orderCol] ? 1 : -1));
                  const match = matched[0] ?? null;
                  return { data: match, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      insert: (row: Record<string, any>) => {
        const saved = {
          ...row,
          id: row.id ?? `row-${rows.length + 1}`,
          created_at: new Date().toISOString(),
        };
        rows.push(saved);
        return {
          select: (_cols: string) => ({
            single: async () => ({ data: { id: saved.id }, error: null }),
          }),
          then: undefined, // not a thenable
          error: null,
        };
      },
    };
  }

  return { from: fromTable, _rows: rows };
}

// ─── Fixture UUIDs ───────────────────────────────────────────────────

const COMPANY_ID = 'aaaa0000-0000-0000-0000-000000000001';
const WORKER_ID = 'aaaa0000-0000-0000-0000-000000000002';
const SITE_ID = 'aaaa0000-0000-0000-0000-000000000003';
const SHIFT_ID = 'aaaa0000-0000-0000-0000-000000000100';

// ─── Tests ────────────────────────────────────────────────────────────

describe('getV1ChainTail — no v1.0 events yet', () => {
  it('seals and inserts a bridge event, returns its hash', async () => {
    const mock: any = makeMockSupabase();
    const tail = await getV1ChainTail(mock, COMPANY_ID);

    expect(tail).toMatch(/^[0-9a-f]{64}$/);
    expect(mock._rows.length).toBe(1);

    const bridge = mock._rows[0];
    expect(bridge.event_type).toBe('X-FLOSMOSIS-SPEC_VERSION_MIGRATION');
    expect(bridge.previous_event_hash).toBe(ZERO_HASH);
    expect(bridge.spec_version).toBe('1.0');
    expect(bridge.company_id).toBe(COMPANY_ID);
    expect(bridge.worker_id).toBeNull();
    expect(bridge.wles_event.actor_id).toBe(FLOSMOSIS_SYSTEM_ACTOR_ID);
    expect(bridge.wles_event.subject_id).toBe(COMPANY_ID);
    expect(bridge.wles_event.payload.from_spec_version).toBe('0');
    expect(bridge.wles_event.payload.to_spec_version).toBe('1.0');
    expect(bridge.wles_event.payload.from_chain_tail_hash).toBe(ZERO_HASH); // no prior v0
    expect(bridge.event_hash).toBe(tail);
  });

  it('references the v0 chain tail hash in the bridge payload when prior v0 exists', async () => {
    const v0Tail = 'deadbeef' + '0'.repeat(56);
    const mock: any = makeMockSupabase([
      {
        id: 'v0-existing',
        company_id: COMPANY_ID,
        spec_version: '0',
        event_type: 'START_EVENT',
        event_hash: v0Tail,
        created_at: '2026-04-20T06:00:00.000Z',
      },
    ]);

    const tail = await getV1ChainTail(mock, COMPANY_ID);
    const bridge = mock._rows.find(
      (r: any) => r.event_type === 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
    );

    expect(bridge).toBeDefined();
    expect(bridge!.wles_event.payload.from_chain_tail_hash).toBe(v0Tail);
    expect(bridge!.event_hash).toBe(tail);
  });
});

describe('getV1ChainTail — v1.0 events already exist', () => {
  it('returns the most recent v1.0 event_hash without creating a bridge', async () => {
    const existingV1Hash = 'ab'.repeat(32);
    const mock: any = makeMockSupabase([
      {
        id: 'v1-existing',
        company_id: COMPANY_ID,
        spec_version: '1.0',
        event_type: 'CLOCK_IN',
        event_hash: existingV1Hash,
        created_at: '2026-04-27T10:00:00.000Z',
      },
    ]);

    const tail = await getV1ChainTail(mock, COMPANY_ID);
    expect(tail).toBe(existingV1Hash);

    // No new bridge inserted — row count unchanged.
    expect(mock._rows.length).toBe(1);
  });
});

describe('insertV1Event', () => {
  it('writes a sealed CLOCK_IN event with spec_version=1.0 and wles_event populated', async () => {
    const mock: any = makeMockSupabase();

    const unsealed = buildClockIn({
      eventId: 'e2e00000-0000-0000-0000-000000000202',
      actorId: WORKER_ID,
      subjectId: WORKER_ID,
      timestamp: '2026-04-27T07:00:00.000Z',
      previousEventHash: ZERO_HASH,
      shiftId: SHIFT_ID,
      siteId: SITE_ID,
      detectionMethod: 'geofence',
    });
    const sealed = sealEvent(unsealed);

    const result = await insertV1Event(mock, sealed, {
      companyId: COMPANY_ID,
      workerId: WORKER_ID,
      siteId: SITE_ID,
      createdBy: 'field:start',
      gpsLat: '-35.47',
      gpsLng: '149.22',
      gpsAccuracyMetres: '8.0',
    });

    expect(result.id).toBeDefined();
    expect(mock._rows.length).toBe(1);
    const row = mock._rows[0];
    expect(row.event_type).toBe('CLOCK_IN');
    expect(row.spec_version).toBe('1.0');
    expect(row.wles_event).toBeDefined();
    expect(row.wles_event.event_hash).toBe(sealed.event_hash);
    expect(row.event_hash).toBe(sealed.event_hash);
    expect(row.previous_event_hash).toBe(ZERO_HASH);
    expect(row.company_id).toBe(COMPANY_ID);
    expect(row.worker_id).toBe(WORKER_ID);
    expect(row.site_id).toBe(SITE_ID);
    expect(row.gps_lat).toBe('-35.47');
    expect(row.created_by).toBe('field:start');
  });

  it('accepts null worker/site for system-actor events', async () => {
    const mock: any = makeMockSupabase();

    const unsealed = buildClockIn({
      eventId: '11111111-2222-3333-4444-555555555555',
      actorId: FLOSMOSIS_SYSTEM_ACTOR_ID,
      subjectId: COMPANY_ID,
      timestamp: '2026-04-27T08:00:00.000Z',
      previousEventHash: ZERO_HASH,
      shiftId: SHIFT_ID,
      siteId: SITE_ID,
      detectionMethod: 'supervisor',
    });
    const sealed = sealEvent(unsealed);

    await insertV1Event(mock, sealed, {
      companyId: COMPANY_ID,
      workerId: null,
      siteId: null,
      createdBy: 'system:test',
    });

    expect(mock._rows[0].worker_id).toBeNull();
    expect(mock._rows[0].site_id).toBeNull();
  });

  it('writes the canonical substrate event_type via eventTypeForSubstrate while wles_event keeps the WLES type (m0d split)', async () => {
    const mock: any = makeMockSupabase();

    const sealed = sealEvent(
      buildApproval({
        actorId: WORKER_ID,
        subjectId: WORKER_ID,
        timestamp: '2026-04-27T15:30:00.000Z',
        previousEventHash: ZERO_HASH,
        shiftId: SHIFT_ID,
        approvedHours: 8,
        approvalMethod: 'web',
        layer: 'supervisor',
      }),
    );
    expect(sealed.event_type).toBe('APPROVAL');

    await insertV1Event(mock, sealed, {
      companyId: COMPANY_ID,
      workerId: WORKER_ID,
      siteId: SITE_ID,
      createdBy: 'verify:approve',
      eventTypeForSubstrate: 'SUPERVISOR_APPROVAL',
    });

    const row = mock._rows[0];
    // Substrate column carries the canonical bare name (m0d enum); the
    // sealed WLES type (and the hash) are untouched in wles_event.
    expect(row.event_type).toBe('SUPERVISOR_APPROVAL');
    expect(row.wles_event.event_type).toBe('APPROVAL');
    expect(row.wles_event.payload.layer).toBe('supervisor');
    expect(row.event_hash).toBe(sealed.event_hash);
    expect(row.spec_version).toBe('1.0');
  });

  it('falls back to the WLES event_type when eventTypeForSubstrate is omitted', async () => {
    const mock: any = makeMockSupabase();
    const sealed = sealEvent(
      buildApproval({
        actorId: WORKER_ID,
        subjectId: WORKER_ID,
        timestamp: '2026-04-27T15:31:00.000Z',
        previousEventHash: ZERO_HASH,
        shiftId: SHIFT_ID,
        approvedHours: 8,
        approvalMethod: 'web',
      }),
    );
    await insertV1Event(mock, sealed, {
      companyId: COMPANY_ID,
      workerId: WORKER_ID,
      createdBy: 'x',
    });
    expect(mock._rows[0].event_type).toBe('APPROVAL');
  });
});

describe('createBridgeEvent — isolation from getV1ChainTail', () => {
  it('seals a bridge event and inserts it with the correct shape', async () => {
    const mock: any = makeMockSupabase();
    const tail = await createBridgeEvent(mock, COMPANY_ID);
    expect(mock._rows.length).toBe(1);
    expect(mock._rows[0].event_type).toBe('X-FLOSMOSIS-SPEC_VERSION_MIGRATION');
    expect(mock._rows[0].event_hash).toBe(tail);
    expect(mock._rows[0].spec_version).toBe('1.0');
  });
});
