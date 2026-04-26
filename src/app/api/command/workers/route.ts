// Day 5 P1.2 — company_id derived server-side (was client-supplied; GAP-A3-001 closure).
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
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

  const supabase = createServiceClient();
  const { data: workers, error } = await supabase
    .from('workers')
    .select('id, first_name, last_name, phone, email, employee_id, pay_rate, award_classification, is_active, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

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

  const body = await request.json() as {
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
    return NextResponse.json({ error: 'first_name, last_name, phone, employee_id, pay_rate are required' }, { status: 400 });
  }

  // Security: validate pay rate bounds
  const payRateNum = parseFloat(pay_rate);
  if (isNaN(payRateNum) || payRateNum < 0.01 || payRateNum > 500) {
    return NextResponse.json(
      { error: 'pay_rate must be between $0.01 and $500.00' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  // Check duplicate phone within this company.
  const { data: existing } = await supabase
    .from('workers')
    .select('id')
    .eq('phone', phone)
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A worker with this phone number already exists' }, { status: 409 });
  }

  const { data: worker, error } = await supabase
    .from('workers')
    .insert({
      first_name,
      last_name,
      phone,
      email: body.email || null,
      employee_id,
      pay_rate: parseFloat(pay_rate).toFixed(2),
      award_classification: body.award_classification || null,
      company_id: companyId,
      is_active: true,
    })
    .select('id, first_name, last_name, employee_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ worker }, { status: 201 });
}
