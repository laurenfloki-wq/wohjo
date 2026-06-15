// Amend / deactivate a supervisor. PATCH /api/command/supervisors/[supervisorId]
//
// Same amendment pattern as workers: operational fields only (name,
// mobile, email, active). Every change updates the row AND writes an
// immutable admin_access_log line. "Remove" = is_active=false.

import { NextResponse } from 'next/server';
import { supervisorsRepo } from '@/lib/db/repositories/supervisors.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';
import { toCanonical } from '@/lib/utils/phoneNormaliser';

interface SupRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  is_active: boolean;
}

interface PatchBody {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  is_active?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ supervisorId: string }> },
) {
  const log = routeLogger('PATCH /api/command/supervisors/:id', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { supervisorId } = await params;
  if (!supervisorId) return NextResponse.json({ error: 'supervisor id is required' }, { status: 400 });

  const repo = supervisorsRepo(companyId);
  const { data: current } = await repo.getById(supervisorId);
  if (!current) return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
  const sup = current as SupRow;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.name !== undefined) {
    const v = str(body.name);
    if (v !== undefined && v !== (sup.name ?? '')) {
      if (v.length === 0) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      patch.name = v;
      changes.push('name changed');
    }
  }

  if (body.email !== undefined) {
    const v = str(body.email);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (sup.email ?? null)) {
      patch.email = next;
      changes.push('email changed');
    }
  }

  if (body.phone !== undefined) {
    const raw = str(body.phone) ?? '';
    let canonical: string;
    try {
      canonical = toCanonical(raw);
    } catch {
      return NextResponse.json(
        { error: 'That mobile doesn’t look like an Australian number — try 04xx xxx xxx.' },
        { status: 400 },
      );
    }
    if (canonical !== sup.phone) {
      const { data: clash } = await repo.findIdByPhone(canonical);
      if (clash && (clash as { id: string }).id !== supervisorId) {
        return NextResponse.json({ error: 'Another supervisor already has this phone number.' }, { status: 409 });
      }
      patch.phone = canonical;
      changes.push('phone changed');
    }
  }

  let action = 'AMEND';
  if (typeof body.is_active === 'boolean' && body.is_active !== sup.is_active) {
    patch.is_active = body.is_active;
    action = body.is_active ? 'REACTIVATE' : 'DEACTIVATE';
    changes.push(`is_active ${sup.is_active}→${body.is_active}`);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ supervisor: sup, unchanged: true });
  }

  const { data: updated, error } = await repo.updateFields(supervisorId, patch);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'supervisor',
    resourceId: supervisorId,
    action,
    reasonCode: changes.join('; '),
    request,
  });

  return NextResponse.json({ supervisor: updated });
}
