// Amend / deactivate a worker. PATCH /api/command/workers/[workerId]
//
// Operational fields only (pay rate, mobile, employee #, name, award,
// active). Sealed labour hours are never touched. Every change updates
// the workers row AND writes an immutable admin_access_log line, so an
// edit is an auditable amendment, not destruction. "Remove" is a status
// change (is_active=false), never a delete (non-negotiable #6).

import { NextResponse } from 'next/server';
import { workersRepo } from '@/lib/db/repositories/workers.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';
import { toCanonical } from '@/lib/utils/phoneNormaliser';
import { isCanonicalCategory } from '@/lib/payroll/categories';

type ActivityMappings = Record<string, string>;

interface WorkerRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  employee_id: string;
  myob_card_id: string | null;
  activity_mappings: ActivityMappings | null;
  pay_rate: string;
  award_classification: string | null;
  is_active: boolean;
}

interface PatchBody {
  first_name?: unknown;
  last_name?: unknown;
  phone?: unknown;
  email?: unknown;
  employee_id?: unknown;
  myob_card_id?: unknown;
  activity_mappings?: unknown;
  pay_rate?: unknown;
  award_classification?: unknown;
  is_active?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

/** Validate + normalise an incoming per-worker activity-mappings object.
 *  Accepts only the eight canonical category keys with non-empty string
 *  Activity IDs; blank values drop the mapping for that category. Returns
 *  the cleaned map, or an error message for the 400 response. */
function cleanActivityMappings(
  input: unknown,
): { ok: true; value: ActivityMappings } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'activity_mappings must be an object' };
  }
  const out: ActivityMappings = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isCanonicalCategory(key)) {
      return { ok: false, error: `Unknown payroll category "${key}"` };
    }
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw !== 'string') {
      return { ok: false, error: `Activity ID for "${key}" must be text` };
    }
    const v = raw.trim();
    if (v.length === 0) continue;
    if (v.length > 64) {
      return { ok: false, error: `Activity ID for "${key}" is too long (max 64)` };
    }
    out[key] = v;
  }
  return { ok: true, value: out };
}

/** Stable JSON for change-detection: keys sorted so {a,b} === {b,a}. */
function stableMap(m: ActivityMappings | null | undefined): string {
  if (!m) return '{}';
  const keys = Object.keys(m).sort();
  return JSON.stringify(keys.map((k) => [k, m[k]]));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const log = routeLogger('PATCH /api/command/workers/:id', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { workerId } = await params;
  if (!workerId) return NextResponse.json({ error: 'worker id is required' }, { status: 400 });

  const repo = workersRepo(companyId);
  const { data: current } = await repo.getById(workerId);
  if (!current) return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
  const worker = current as WorkerRow;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  for (const f of ['first_name', 'last_name', 'employee_id'] as const) {
    const v = str(body[f]);
    if (v !== undefined && v !== worker[f]) {
      if (v.length === 0) return NextResponse.json({ error: `${f} cannot be empty` }, { status: 400 });
      patch[f] = v;
      changes.push(`${f} ${worker[f]}→${v}`);
    }
  }

  if (body.award_classification !== undefined) {
    const v = str(body.award_classification);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (worker.award_classification ?? null)) {
      patch.award_classification = next;
      changes.push('award changed');
    }
  }

  if (body.email !== undefined) {
    const v = str(body.email);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (worker.email ?? null)) {
      patch.email = next;
      changes.push('email changed');
    }
  }

  // Optional payroll-provider ID (MYOB card id) — nullable text that feeds
  // the export, same data class as the award; never sealed evidence.
  if (body.myob_card_id !== undefined) {
    const v = str(body.myob_card_id);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (worker.myob_card_id ?? null)) {
      patch.myob_card_id = next;
      changes.push('myob_card_id changed');
    }
  }

  // Per-worker payroll activity mappings (category → provider Activity ID).
  // Fully per-worker, no company default — the whole map is replaced on
  // save. Same operational data class as the award; never sealed evidence.
  if (body.activity_mappings !== undefined) {
    const result = cleanActivityMappings(body.activity_mappings);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    if (stableMap(result.value) !== stableMap(worker.activity_mappings)) {
      patch.activity_mappings = result.value;
      changes.push('payroll mappings changed');
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
    if (canonical !== worker.phone) {
      const { data: clash } = await repo.findIdByPhone(canonical);
      if (clash && (clash as { id: string }).id !== workerId) {
        return NextResponse.json({ error: 'Another worker already has this phone number.' }, { status: 409 });
      }
      patch.phone = canonical;
      changes.push('phone changed');
    }
  }

  if (body.pay_rate !== undefined) {
    const raw = str(body.pay_rate) ?? '';
    const n = Number.parseFloat(raw);
    if (Number.isNaN(n) || n < 0.01 || n > 500) {
      return NextResponse.json({ error: 'pay_rate must be between $0.01 and $500.00' }, { status: 400 });
    }
    const next = n.toFixed(2);
    if (next !== Number(worker.pay_rate).toFixed(2)) {
      patch.pay_rate = next;
      changes.push(`pay_rate ${Number(worker.pay_rate).toFixed(2)}→${next}`);
    }
  }

  let action = 'AMEND';
  if (typeof body.is_active === 'boolean' && body.is_active !== worker.is_active) {
    patch.is_active = body.is_active;
    action = body.is_active ? 'REACTIVATE' : 'DEACTIVATE';
    changes.push(`is_active ${worker.is_active}→${body.is_active}`);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ worker, unchanged: true });
  }

  const { data: updated, error } = await repo.updateFields(workerId, patch);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'worker',
    resourceId: workerId,
    action,
    reasonCode: changes.join('; '),
    request,
  });

  return NextResponse.json({ worker: updated });
}
