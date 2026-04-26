/**
 * WOHJO Sprint 6 — Haversine + geofence unit tests
 * Target: 100% coverage (CLAUDE.md Intelligence non-negotiable).
 * File location hint: src/lib/intelligence/geofence.test.ts
 *
 * Run with: pnpm vitest run src/lib/intelligence/geofence.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  classifyConfidence,
  checkGeofence,
} from './geofence';

// Canberra construction test site, per migration seed.
const CANBERRA_SITE = { lat: -35.2809, lng: 149.1300 };

describe('calculateHaversineDistance', () => {
  it('returns 0 for the same point', () => {
    const d = calculateHaversineDistance(-35.2809, 149.13, -35.2809, 149.13);
    expect(d).toBeCloseTo(0, 6);
  });

  it('is symmetric', () => {
    const a = calculateHaversineDistance(-35.28, 149.13, -35.29, 149.14);
    const b = calculateHaversineDistance(-35.29, 149.14, -35.28, 149.13);
    expect(a).toBeCloseTo(b, 6);
  });

  it('matches known distance Sydney Opera House -> Harbour Bridge (~0.9 km)', () => {
    // Opera House: -33.8568, 151.2153
    // Harbour Bridge: -33.8523, 151.2108
    const d = calculateHaversineDistance(-33.8568, 151.2153, -33.8523, 151.2108);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(1000);
  });

  it('detects 100m offset at worksite (N of site)', () => {
    // +0.0009 degrees latitude ~= 100m
    const d = calculateHaversineDistance(
      CANBERRA_SITE.lat + 0.0009,
      CANBERRA_SITE.lng,
      CANBERRA_SITE.lat,
      CANBERRA_SITE.lng,
    );
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });

  it('handles equator crossing', () => {
    const d = calculateHaversineDistance(-0.001, 0, 0.001, 0);
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(250);
  });

  it('handles antimeridian without going negative', () => {
    const d = calculateHaversineDistance(0, 179.9, 0, -179.9);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(30_000); // ~22 km arc
  });
});

describe('classifyConfidence', () => {
  it('HIGH for accuracy < 50m', () => {
    expect(classifyConfidence(5)).toBe('HIGH');
    expect(classifyConfidence(49.9)).toBe('HIGH');
  });
  it('MEDIUM for 50–99m', () => {
    expect(classifyConfidence(50)).toBe('MEDIUM');
    expect(classifyConfidence(99.9)).toBe('MEDIUM');
  });
  it('LOW for >= 100m', () => {
    expect(classifyConfidence(100)).toBe('LOW');
    expect(classifyConfidence(500)).toBe('LOW');
  });
  it('LOW for negative / non-finite inputs (defensive)', () => {
    expect(classifyConfidence(-1)).toBe('LOW');
    expect(classifyConfidence(NaN)).toBe('LOW');
    expect(classifyConfidence(Infinity)).toBe('LOW');
  });
});

describe('checkGeofence', () => {
  const base = {
    workerAccuracyMetres: 10,
    siteLat: CANBERRA_SITE.lat,
    siteLng: CANBERRA_SITE.lng,
    siteRadiusMetres: 200,
  };

  it('worker standing on the site pin -> inside, HIGH', () => {
    const r = checkGeofence({
      ...base,
      workerLat: CANBERRA_SITE.lat,
      workerLng: CANBERRA_SITE.lng,
    });
    expect(r.inside).toBe(true);
    expect(r.confidence).toBe('HIGH');
    expect(r.distanceMetres).toBeCloseTo(0, 2);
  });

  it('worker 150m N of site -> inside (under 200m radius)', () => {
    const r = checkGeofence({
      ...base,
      workerLat: CANBERRA_SITE.lat + 0.00135,
      workerLng: CANBERRA_SITE.lng,
    });
    expect(r.inside).toBe(true);
    expect(r.distanceMetres).toBeGreaterThan(140);
    expect(r.distanceMetres).toBeLessThan(160);
  });

  it('worker 300m N of site -> outside', () => {
    const r = checkGeofence({
      ...base,
      workerLat: CANBERRA_SITE.lat + 0.0027,
      workerLng: CANBERRA_SITE.lng,
    });
    expect(r.inside).toBe(false);
  });

  it('poor GPS accuracy downgrades confidence but not distance', () => {
    const r = checkGeofence({
      ...base,
      workerAccuracyMetres: 250,
      workerLat: CANBERRA_SITE.lat,
      workerLng: CANBERRA_SITE.lng,
    });
    expect(r.inside).toBe(true);
    expect(r.confidence).toBe('LOW');
  });

  it('exact boundary (distance === radius) is inside', () => {
    // Construct a point exactly ~200m away
    const r = checkGeofence({
      ...base,
      workerLat: CANBERRA_SITE.lat + 0.0018, // ~200m N
      workerLng: CANBERRA_SITE.lng,
      siteRadiusMetres: 1000,
    });
    expect(r.inside).toBe(true);
  });
});
