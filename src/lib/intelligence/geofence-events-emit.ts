// Gate R-FOR-1 — internal geofence_events emission helper.
//
// Server-side, service-role companion to the client-side
// useGeofenceWatch hook. Routes that receive GPS coordinates
// (clock-in, clock-out, intermediate position pings) call
// emitGeofenceEvent() to write a corroborating row.
//
// Unlike useGeofenceWatch, this path:
//   - Does NOT filter by confidence (records the raw reading).
//   - Does NOT enforce one-per-day uniqueness (each emission is
//     idempotent only on (worker_id, detected_at) at second
//     granularity — duplicate inserts within the same second by
//     the same worker are caller-prevented).
//   - Does NOT require client geolocation permission.
//
// Failure mode is LOG-ONLY. Side-pipe writes never gate the
// user-facing response.
//
// §10 Q3 dependency: the company_id column existence in production
// is verified post-deploy by chat-Claude via Supabase MCP. If the
// column is absent, this insert fails with a column-does-not-exist
// error and the fail-soft path swallows it — surfaces in Vercel
// Logs as `geofence_events.internal_emit_failed`.

import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';
import { checkGeofence, type GeofenceConfidence } from './geofence';

export interface EmitGeofenceEventInput {
  workerId: string;
  siteId: string;
  detectedAt: Date;
  workerLat: number;
  workerLng: number;
  workerAccuracyMetres: number;
  siteLat: number;
  siteLng: number;
  siteRadiusMetres: number;
  companyId: string | null;
  supabase?: ReturnType<typeof createServiceClient>;
}

export async function emitGeofenceEvent(log: Logger, input: EmitGeofenceEventInput): Promise<void> {
  try {
    const supabase = input.supabase ?? createServiceClient();
    const evaluation = checkGeofence({
      workerLat: input.workerLat,
      workerLng: input.workerLng,
      workerAccuracyMetres: input.workerAccuracyMetres,
      siteLat: input.siteLat,
      siteLng: input.siteLng,
      siteRadiusMetres: input.siteRadiusMetres,
    });
    const confidence: GeofenceConfidence = evaluation.confidence;
    // Insert regardless of confidence — server-side records the raw
    // reading; downstream analysis can filter on confidence column.
    const { error } = await supabase.from('geofence_events').insert({
      worker_id: input.workerId,
      site_id: input.siteId,
      detected_at: input.detectedAt.toISOString(),
      lat: input.workerLat,
      lng: input.workerLng,
      accuracy_metres: Math.round(input.workerAccuracyMetres),
      confidence,
      synced_from_offline: false,
      company_id: input.companyId,
    });
    if (error) {
      log.warn(
        {
          err: error.message,
          workerId: input.workerId,
          siteId: input.siteId,
          confidence,
        },
        'geofence_events.internal_emit_failed',
      );
      return;
    }
    log.info(
      {
        workerId: input.workerId,
        siteId: input.siteId,
        confidence,
      },
      'geofence_events.internal_emit',
    );
  } catch (e) {
    log.warn(
      {
        err: e instanceof Error ? e.message : 'unknown',
        workerId: input.workerId,
      },
      'geofence_events.internal_emit_exception',
    );
  }
}
