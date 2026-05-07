/**
 * Sprint 6 — Haversine distance + geofence utilities
 * Pure functions — no DB, no browser APIs, fully unit-testable.
 * File location hint: src/lib/intelligence/geofence.ts
 */

/**
 * Great-circle distance between two WGS84 points, in metres.
 * Uses Haversine formula. Accurate to ~0.5% for distances
 * under 100 km (plenty for a 200m geofence).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Classify raw GPS accuracy in metres into a FLOSTRUCTION confidence tier.
 * Thresholds match the worker-facing language on the EOD confirm screen.
 */
export type GeofenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export function classifyConfidence(accuracyMetres: number): GeofenceConfidence {
  if (!Number.isFinite(accuracyMetres) || accuracyMetres < 0) return 'LOW';
  if (accuracyMetres < 50) return 'HIGH';
  if (accuracyMetres < 100) return 'MEDIUM';
  return 'LOW';
}

/**
 * Pure "am I inside the geofence?" check.
 * Returns { inside, distanceMetres, confidence }.
 */
export interface GeofenceCheckInput {
  workerLat: number;
  workerLng: number;
  workerAccuracyMetres: number;
  siteLat: number;
  siteLng: number;
  siteRadiusMetres: number;
}
export interface GeofenceCheckResult {
  inside: boolean;
  distanceMetres: number;
  confidence: GeofenceConfidence;
}

export function checkGeofence(input: GeofenceCheckInput): GeofenceCheckResult {
  const distanceMetres = calculateHaversineDistance(
    input.workerLat,
    input.workerLng,
    input.siteLat,
    input.siteLng,
  );
  return {
    inside: distanceMetres <= input.siteRadiusMetres,
    distanceMetres,
    confidence: classifyConfidence(input.workerAccuracyMetres),
  };
}
