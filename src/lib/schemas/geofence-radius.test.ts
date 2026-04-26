import { describe, it, expect } from 'vitest';
import { SiteCreateSchema } from './index';

describe('SiteCreateSchema.geofenceRadiusMetres — Day 3 P3 bound', () => {
  const base = {
    name: 'Test Site',
    address: '1 Test St, Canberra ACT 2600',
    siteCode: 'TEST-01',
  };

  it('accepts the default 200m', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 200 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geofenceRadiusMetres).toBe(200);
  });

  it('accepts the lower bound 50m', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 50 });
    expect(r.success).toBe(true);
  });

  it('accepts the upper bound 1000m', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 1000 });
    expect(r.success).toBe(true);
  });

  it('rejects 49m (one below minimum) with the expected message', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 49 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' | ');
      expect(msg).toMatch(/at least 50 metres/);
    }
  });

  it('rejects 1001m (one above maximum) with the expected message', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 1001 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' | ');
      expect(msg).toMatch(/no more than 1000 metres/);
    }
  });

  it('rejects zero', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects negative', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer (e.g. 200.5)', () => {
    const r = SiteCreateSchema.safeParse({ ...base, geofenceRadiusMetres: 200.5 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' | ');
      expect(msg).toMatch(/whole number/);
    }
  });

  it('applies default 200 when omitted', () => {
    const r = SiteCreateSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.geofenceRadiusMetres).toBe(200);
  });
});
