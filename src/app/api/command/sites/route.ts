import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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

  const supabase = createServiceClient();
  const { data: sites, error } = await supabase
    .from('sites')
    .select('id, name, address, site_code, geofence_radius_metres, is_active, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

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

  const supabase = createServiceClient();
  const { data: site, error } = await supabase
    .from('sites')
    .insert({
      name: body.name,
      address: body.address || null,
      site_code: body.site_code || null,
      geofence_radius_metres: radius ?? 200,
      company_id: companyId,
      is_active: true,
    })
    .select('id, name, site_code')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ site }, { status: 201 });
}
