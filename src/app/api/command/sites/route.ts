import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): company-scoped repository replaces the raw client.
import { sitesRepo } from '@/lib/db/repositories/sites.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/sites', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const repo = sitesRepo(companyId);
  const { data: sites, error } = await repo.list();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sites: sites ?? [] });
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/sites', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const raw = (await request.json()) as Record<string, unknown>;

  // Day 3 P3 — bound geofence radius to 50..1000 metres (matches DB
  // CHECK constraint in migrations/202604220910_geofence_radius_cap.sql
  // and the Zod SiteCreateSchema.geofenceRadiusMetres rule).
  let radius: number | undefined;
  if (typeof raw.geofence_radius_metres === 'string' && raw.geofence_radius_metres.length > 0) {
    const n = parseInt(raw.geofence_radius_metres, 10);
    if (Number.isNaN(n)) {
      return NextResponse.json(
        { error: 'geofence_radius_metres must be an integer' },
        { status: 400 },
      );
    }
    radius = n;
  } else if (typeof raw.geofence_radius_metres === 'number') {
    radius = raw.geofence_radius_metres as number;
  }
  if (radius !== undefined && (radius < 50 || radius > 1000)) {
    log.warn({ geofenceRadiusMetres: radius }, 'sites.create.radius_out_of_bounds');
    return NextResponse.json(
      { error: 'Geofence radius must be between 50 and 1000 metres' },
      { status: 400 },
    );
  }

  const body = raw as {
    name?: string;
    address?: string;
    site_code?: string;
  };
  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Page paradigm Phase 3: accept an optional geocoded centre from the
  // Open-a-site composer. Both coordinates or neither; bounds-checked
  // to Australia.
  let geofenceLat: number | null = null;
  let geofenceLng: number | null = null;
  if (raw.geofence_lat !== undefined || raw.geofence_lng !== undefined) {
    const latN = Number(raw.geofence_lat);
    const lngN = Number(raw.geofence_lng);
    const latOk = Number.isFinite(latN) && latN >= -44 && latN <= -9;
    const lngOk = Number.isFinite(lngN) && lngN >= 112 && lngN <= 154;
    if (!latOk || !lngOk) {
      return NextResponse.json(
        { error: 'geofence_lat/geofence_lng must be coordinates inside Australia' },
        { status: 400 },
      );
    }
    geofenceLat = latN;
    geofenceLng = lngN;
  }

  const repo = sitesRepo(companyId);
  const { data: site, error } = await repo.create({
      name: body.name,
      address: body.address || null,
      site_code: body.site_code || null,
      geofence_lat: geofenceLat,
      geofence_lng: geofenceLng,
      geofence_radius_metres: radius ?? 200,
      is_active: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site }, { status: 201 });
}
