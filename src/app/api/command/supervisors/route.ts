// Day 5 P1.2 — company_id derived server-side (was client-supplied; GAP-A3-001 closure).
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(request: Request) {
  const log = routeLogger('GET /api/command/supervisors', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const supabase = createServiceClient();
  const { data: supervisors, error } = await supabase
    .from('supervisors')
    .select('id, name, phone, email, is_active, verify_token, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supervisors: supervisors ?? [] });
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/command/supervisors', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const body = await request.json() as {
    name: string;
    phone: string;
    email?: string;
  };

  if (!body.name || !body.phone) {
    return NextResponse.json({ error: 'name and phone are required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check duplicate phone within this company only.
  const { data: existing } = await supabase
    .from('supervisors')
    .select('id')
    .eq('phone', body.phone)
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'A supervisor with this phone number already exists' }, { status: 409 });
  }

  const { data: supervisor, error } = await supabase
    .from('supervisors')
    .insert({
      name: body.name,
      phone: body.phone,
      email: body.email || null,
      company_id: companyId,
      is_active: true,
    })
    .select('id, name, phone, verify_token')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ supervisor }, { status: 201 });
}
