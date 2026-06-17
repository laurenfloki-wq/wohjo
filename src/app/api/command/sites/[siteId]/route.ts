// Amend / close a site. PATCH /api/command/sites/[siteId]
//
// Same amendment pattern as workers/supervisors: operational fields
// (name, address, site code, geofence radius, active). Every change
// updates the row AND writes an immutable admin_access_log line.
// "Remove" = is_active=false (close the site), never a delete.

import { NextResponse } from 'next/server';
import { sitesRepo } from '@/lib/db/repositories/sites.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';

interface SiteRow {
  id: string;
  name: string | null;
  address: string | null;
  site_code: string | null;
  geofence_radius_metres: number | null;
  is_active: boolean;
  supervisor_is_director: boolean;
}

interface PatchBody {
  name?: unknown;
  address?: unknown;
  site_code?: unknown;
  geofence_radius_metres?: unknown;
  is_active?: unknown;
  supervisor_is_director?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const log = routeLogger('PATCH /api/command/sites/:id', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { siteId } = await params;
  if (!siteId) return NextResponse.json({ error: 'site id is required' }, { status: 400 });

  const repo = sitesRepo(companyId);
  const { data: current } = await repo.getById(siteId);
  if (!current) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
  const site = current as SiteRow;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.name !== undefined) {
    const v = str(body.name);
    if (v !== undefined && v !== (site.name ?? '')) {
      if (v.length === 0)
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      patch.name = v;
      changes.push('name changed');
    }
  }

  if (body.address !== undefined) {
    const v = str(body.address);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (site.address ?? null)) {
      patch.address = next;
      changes.push('address changed');
    }
  }

  if (body.site_code !== undefined) {
    const v = str(body.site_code);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (site.site_code ?? null)) {
      patch.site_code = next;
      changes.push('site_code changed');
    }
  }

  if (body.geofence_radius_metres !== undefined) {
    const n =
      typeof body.geofence_radius_metres === 'number'
        ? body.geofence_radius_metres
        : Number.parseInt(str(body.geofence_radius_metres) ?? '', 10);
    if (Number.isNaN(n) || n < 50 || n > 1000) {
      return NextResponse.json(
        { error: 'Geofence radius must be between 50 and 1000 metres' },
        { status: 400 },
      );
    }
    if (n !== site.geofence_radius_metres) {
      patch.geofence_radius_metres = n;
      changes.push(`geofence ${site.geofence_radius_metres ?? '?'}→${n}m`);
    }
  }

  let action = 'AMEND';
  if (typeof body.is_active === 'boolean' && body.is_active !== site.is_active) {
    patch.is_active = body.is_active;
    action = body.is_active ? 'REACTIVATE' : 'CLOSE';
    changes.push(`is_active ${site.is_active}→${body.is_active}`);
  }

  if (
    typeof body.supervisor_is_director === 'boolean' &&
    body.supervisor_is_director !== site.supervisor_is_director
  ) {
    patch.supervisor_is_director = body.supervisor_is_director;
    changes.push(
      `supervisor_is_director ${site.supervisor_is_director}→${body.supervisor_is_director}`,
    );
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ site, unchanged: true });
  }

  const { data: updated, error } = await repo.updateFields(siteId, patch);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'site',
    resourceId: siteId,
    action,
    reasonCode: changes.join('; '),
    request,
  });

  return NextResponse.json({ site: updated });
}
