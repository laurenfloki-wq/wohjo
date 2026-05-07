/**
 * Sprint 6 — background geofence watcher (client-side)
 * File location hint: src/lib/intelligence/useGeofenceWatch.ts
 *
 * Contract:
 *   - When called inside a client component with location
 *     permission already granted and a resolved worker site,
 *     it starts navigator.geolocation.watchPosition.
 *   - On first HIGH/MEDIUM confidence detection inside the
 *     geofence for the current calendar day, it:
 *       (a) writes a row to geofence_events via supabase
 *       (b) stores a local mirror in localStorage under
 *           `wohjo_geofence_pending_<yyyy-mm-dd>` if offline
 *       (c) flushes local mirror to Supabase on next success
 *   - It never surfaces UI. Silence is correct behaviour.
 */
'use client';

import { useEffect, useRef } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { checkGeofence, type GeofenceConfidence } from './geofence';

export interface GeofenceWatchSite {
  id: string;
  lat: number;
  lng: number;
  geofence_radius_metres: number;
}

export interface GeofenceWatchParams {
  workerId: string;
  site: GeofenceWatchSite | null;
  permissionGranted: boolean;
}

interface PendingGeofenceEvent {
  worker_id: string;
  site_id: string;
  detected_at: string;
  lat: number;
  lng: number;
  accuracy_metres: number;
  confidence: GeofenceConfidence;
  synced_from_offline: boolean;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const pendingKey = (d: Date) => `wohjo_geofence_pending_${isoDay(d)}`;

export function useGeofenceWatch({
  workerId,
  site,
  permissionGranted,
}: GeofenceWatchParams) {
  const detectedThisSessionRef = useRef(false);

  useEffect(() => {
    if (!permissionGranted || !site || typeof navigator === 'undefined') {
      return;
    }
    if (!navigator.geolocation) return;

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Flush any offline queue from previous sessions/days.
    void flushOfflineQueue(supabase);

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (detectedThisSessionRef.current) return;
        const { latitude, longitude, accuracy } = position.coords;

        const result = checkGeofence({
          workerLat: latitude,
          workerLng: longitude,
          workerAccuracyMetres: accuracy,
          siteLat: site.lat,
          siteLng: site.lng,
          siteRadiusMetres: site.geofence_radius_metres,
        });

        if (!result.inside) return;
        if (result.confidence === 'LOW') return; // avoid false positives

        // Check if an event already exists for this worker+day
        const today = isoDay(new Date());
        const { data: existing } = await supabase
          .from('geofence_events')
          .select('id')
          .eq('worker_id', workerId)
          .gte('detected_at', `${today}T00:00:00Z`)
          .lt('detected_at', `${today}T23:59:59Z`)
          .limit(1);

        if (existing && existing.length > 0) {
          detectedThisSessionRef.current = true;
          return;
        }

        const event: PendingGeofenceEvent = {
          worker_id: workerId,
          site_id: site.id,
          detected_at: new Date().toISOString(),
          lat: latitude,
          lng: longitude,
          accuracy_metres: Math.round(accuracy),
          confidence: result.confidence,
          synced_from_offline: false,
        };

        const { error } = await supabase.from('geofence_events').insert(event);
        if (error) {
          // Offline or RLS hiccup — persist locally, flush later.
          queueOffline(event);
        }
        detectedThisSessionRef.current = true;
      },
      (err) => {
        // Silent failure — EOD manual entry remains available.
        // Build agent: consider logging to `intelligence_flags`
        // at severity LOW for later diagnostics.
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('geofence watch error', err.code, err.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30_000,
        maximumAge: 300_000, // 5 min cache
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [permissionGranted, site, workerId]);
}

function queueOffline(event: PendingGeofenceEvent): void {
  try {
    const key = pendingKey(new Date(event.detected_at));
    const existing = localStorage.getItem(key);
    const queue: PendingGeofenceEvent[] = existing ? JSON.parse(existing) : [];
    queue.push({ ...event, synced_from_offline: true });
    localStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // Storage unavailable — we prefer silent failure over breakage.
  }
}

async function flushOfflineQueue(
  supabase: ReturnType<typeof createBrowserClient>,
): Promise<void> {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('wohjo_geofence_pending_')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const queue: PendingGeofenceEvent[] = JSON.parse(raw);
      if (queue.length === 0) {
        localStorage.removeItem(key);
        continue;
      }
      const { error } = await supabase.from('geofence_events').insert(queue);
      if (!error) localStorage.removeItem(key);
    }
  } catch {
    // Best-effort; try again next session.
  }
}
