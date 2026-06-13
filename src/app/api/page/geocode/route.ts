// Geocode — Open-a-site address confirmation. Session-gated, read-only,
// AU-biased. Uses OpenStreetMap Nominatim (1 req/s policy, attribution
// required — rendered in the composer). A Google Maps key remains a
// founder decision; this endpoint isolates the provider so swapping is
// one file.

import { NextResponse } from 'next/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const log = routeLogger('GET /api/page/geocode', null);
  try {
    await getCompanyIdForSession(log);
  } catch (err) {
    return authErrorResponse(err);
  }
  const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 200) ?? '';
  if (q.length < 4) {
    return NextResponse.json({ error: 'Address is too short to look up' }, { status: 400 });
  }
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FLOSTRUCTION/1.0 (ops@flosmosis.com)' },
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'geocode.provider_error');
      return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
    }
    const rows = (await res.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;
    const hit = rows[0];
    if (hit === undefined || hit.lat === undefined || hit.lon === undefined) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({
      display_name: hit.display_name ?? q,
      lat: Number(hit.lat),
      lng: Number(hit.lon),
    });
  } catch (err) {
    log.error({ err }, 'geocode.unreachable');
    return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
  }
}
