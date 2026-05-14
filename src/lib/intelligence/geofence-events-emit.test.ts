// Gate R-FOR-1 — unit tests for emitGeofenceEvent.
//
// Covers:
//   - happy path: row inserted with all expected geofence columns
//   - confidence is derived from worker accuracy (HIGH / MEDIUM / LOW)
//   - accuracy_metres is rounded
//   - synced_from_offline is always false (server-side path)
//   - fail-soft: error response from Supabase doesn't propagate
//   - fail-soft: thrown Supabase client doesn't propagate

import { describe, it, expect } from 'vitest';
import { emitGeofenceEvent } from './geofence-events-emit';
import pino from 'pino';

const log = pino({ level: 'silent' });

const baseInput = {
  workerId: '58e8bca1-9438-4997-8e57-92a195cfd995',
  siteId: 'b3cf9a82-1234-5678-9abc-def012345678',
  detectedAt: new Date('2026-05-15T08:00:00.000Z'),
  workerLat: -33.8688,
  workerLng: 151.2093,
  workerAccuracyMetres: 30,
  siteLat: -33.8688,
  siteLng: 151.2093,
  siteRadiusMetres: 200,
  companyId: 'c0c0c0c0-1111-2222-3333-444444444444',
};

describe('emitGeofenceEvent', () => {
  it('inserts a row with all expected columns and HIGH confidence', async () => {
    const inserted: unknown[] = [];
    const fake = {
      from: () => ({
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof emitGeofenceEvent>[1]['supabase'];

    await emitGeofenceEvent(log, { ...baseInput, supabase: fake });

    expect(inserted).toHaveLength(1);
    const row = inserted[0] as Record<string, unknown>;
    expect(row.worker_id).toBe(baseInput.workerId);
    expect(row.site_id).toBe(baseInput.siteId);
    expect(row.detected_at).toBe('2026-05-15T08:00:00.000Z');
    expect(row.lat).toBe(baseInput.workerLat);
    expect(row.lng).toBe(baseInput.workerLng);
    expect(row.accuracy_metres).toBe(30);
    expect(row.confidence).toBe('HIGH');
    expect(row.synced_from_offline).toBe(false);
    expect(row.company_id).toBe(baseInput.companyId);
  });

  it('classifies confidence as MEDIUM and LOW from accuracy', async () => {
    const captured: Record<string, unknown>[] = [];
    const fake = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          captured.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof emitGeofenceEvent>[1]['supabase'];

    await emitGeofenceEvent(log, {
      ...baseInput,
      workerAccuracyMetres: 75,
      supabase: fake,
    });
    await emitGeofenceEvent(log, {
      ...baseInput,
      workerAccuracyMetres: 200,
      supabase: fake,
    });
    await emitGeofenceEvent(log, {
      ...baseInput,
      workerAccuracyMetres: 49.6,
      supabase: fake,
    });

    expect(captured[0]?.confidence).toBe('MEDIUM');
    expect(captured[0]?.accuracy_metres).toBe(75);
    expect(captured[1]?.confidence).toBe('LOW');
    expect(captured[1]?.accuracy_metres).toBe(200);
    expect(captured[2]?.confidence).toBe('HIGH');
    expect(captured[2]?.accuracy_metres).toBe(50); // rounded
  });

  it('never throws when the supabase client rejects', async () => {
    const fake = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: 'column "company_id" does not exist' } }),
      }),
    } as unknown as Parameters<typeof emitGeofenceEvent>[1]['supabase'];

    await expect(emitGeofenceEvent(log, { ...baseInput, supabase: fake })).resolves.toBeUndefined();
  });

  it('never throws when the supabase client itself throws', async () => {
    const fake = {
      from: () => {
        throw new Error('connection lost');
      },
    } as unknown as Parameters<typeof emitGeofenceEvent>[1]['supabase'];

    await expect(emitGeofenceEvent(log, { ...baseInput, supabase: fake })).resolves.toBeUndefined();
  });
});
