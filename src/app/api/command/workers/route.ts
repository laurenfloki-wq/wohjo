// Day 5 P1.2 — company_id derived server-side (was client-supplied; GAP-A3-001 closure).
import { NextResponse } from 'next/server';
import { workersRepo } from '@/lib/db/repositories/workers.repo';
import { toCanonical } from '@/lib/utils/phoneNormaliser';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/workers', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const repo = workersRepo(companyId);
  const { data: workers, error } = await repo.list();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ workers: workers ?? [] });
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/workers', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const body = (await request.json()) as {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string;
    employee_id: string;
    pay_rate: string;
    award_classification?: string;
  };

  const { first_name, last_name, phone, employee_id, pay_rate } = body;
  if (!first_name || !last_name || !phone || !employee_id || !pay_rate) {
    return NextResponse.json(
      { error: 'first_name, last_name, phone, employee_id, pay_rate are required' },
      { status: 400 },
    );
  }

  // Security: validate pay rate bounds
  const payRateNum = parseFloat(pay_rate);
  if (isNaN(payRateNum) || payRateNum < 0.01 || payRateNum > 500) {
    return NextResponse.json(
      { error: 'pay_rate must be between $0.01 and $500.00' },
      { status: 400 },
    );
  }

  // Normalise to canonical E.164 (+61XXXXXXXXX) so the stored number is
  // Twilio-ready. Worker/supervisor SMS sends fail with Twilio error 21211
  // ("not a valid phone number") if the stored value isn't valid E.164.
  // Accepts 0413…, +61413…, 61413…, and spaced/dashed variants.
  let canonicalPhone: string;
  try {
    canonicalPhone = toCanonical(phone);
  } catch {
    return NextResponse.json(
      { error: 'Enter a valid Australian mobile number (e.g. 0413 573 579 or +61413573579).' },
      { status: 400 },
    );
  }

  const repo = workersRepo(companyId);

  // Check duplicate phone within this company (canonical form).
  const { data: existing } = await repo.findIdByPhone(canonicalPhone);
  if (existing) {
    return NextResponse.json(
      { error: 'A worker with this phone number already exists' },
      { status: 409 },
    );
  }

  const { data: worker, error } = await repo.create({
    first_name,
    last_name,
    phone: canonicalPhone,
    email: body.email || null,
    employee_id,
    pay_rate: parseFloat(pay_rate).toFixed(2),
    award_classification: body.award_classification || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ worker }, { status: 201 });
}
