// Amend company details. PATCH /api/command/company
//
// The genuine company-level settings: name, ABN, contact email/phone. Every
// change updates the companies row AND writes an immutable admin_access_log
// line, so an edit is an auditable amendment. System-managed fields (billing,
// onboarding, Stripe) are never touched here.

import { NextResponse } from 'next/server';
import { companyRepo } from '@/lib/db/repositories/company.repo';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { logAdminAction } from '@/lib/audit/admin-access-log';

interface CompanyRow {
  id: string;
  name: string;
  abn: string | null;
  abn_digits: string | null;
  contact_email: string;
  contact_phone: string | null;
}

interface PatchBody {
  name?: unknown;
  abn?: unknown;
  contact_email?: unknown;
  contact_phone?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined;
}

// Deliberately permissive — enough to catch a fat-fingered address, not a
// strict RFC validator (those reject valid addresses).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(request: Request) {
  const log = routeLogger('PATCH /api/command/company', request.headers.get('x-request-id'));

  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const repo = companyRepo(companyId);
  const { data: current } = await repo.get();
  if (!current) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  const company = current as CompanyRow;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.name !== undefined) {
    const v = str(body.name);
    if (v === undefined || v.length === 0) {
      return NextResponse.json({ error: 'Company name cannot be empty' }, { status: 400 });
    }
    if (v !== company.name) {
      patch.name = v;
      changes.push('name changed');
    }
  }

  if (body.contact_email !== undefined) {
    const v = str(body.contact_email);
    if (v === undefined || !EMAIL_RE.test(v)) {
      return NextResponse.json({ error: 'That doesn’t look like a valid email.' }, { status: 400 });
    }
    if (v !== company.contact_email) {
      patch.contact_email = v;
      changes.push('contact email changed');
    }
  }

  if (body.contact_phone !== undefined) {
    const v = str(body.contact_phone);
    const next = v !== undefined && v.length > 0 ? v : null;
    if (next !== (company.contact_phone ?? null)) {
      patch.contact_phone = next;
      changes.push('contact phone changed');
    }
  }

  // ABN: store the entered form for display plus the 11-digit canonical form
  // used on exports/evidence. Cleared together when blanked.
  if (body.abn !== undefined) {
    const v = str(body.abn);
    if (v !== undefined && v.length > 0) {
      const digits = v.replace(/\D/g, '');
      if (digits.length !== 11) {
        return NextResponse.json(
          { error: 'An ABN is 11 digits — check the number.' },
          { status: 400 },
        );
      }
      if (v !== (company.abn ?? null) || digits !== (company.abn_digits ?? null)) {
        patch.abn = v;
        patch.abn_digits = digits;
        changes.push('ABN changed');
      }
    } else if (company.abn !== null || company.abn_digits !== null) {
      patch.abn = null;
      patch.abn_digits = null;
      changes.push('ABN cleared');
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ company, unchanged: true });
  }

  const { data: updated, error } = await repo.updateFields(patch);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // action must be one of the admin_access_log CHECK values
  // (read/export/impersonate/delete/update/alert/other); the specifics go in
  // the reason code.
  await logAdminAction(log, {
    adminUserId: userId,
    companyId,
    resourceType: 'company',
    resourceId: companyId,
    action: 'update',
    reasonCode: `company amended — ${changes.join('; ')}`,
    request,
  });

  return NextResponse.json({ company: updated });
}
