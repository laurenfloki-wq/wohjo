// Saturday Shape A — Task A4: onboarding status endpoint.
//
// GET /api/onboarding/status?session_id=cs_test_...
//
// Returns the provisioning state for the given Stripe Checkout
// Session. The /setting-up page polls this every 5s after a
// successful checkout to know when the tenant is ready.
//
// State machine:
//   pending  — checkout.session.completed event NOT yet received OR
//              not yet processed by the webhook handler
//   ready    — provision_tenant_from_checkout RPC succeeded; the
//              companies row exists; redirect the user to /command
//   failed   — provision_tenant_from_checkout failed OR founding cap
//              reached requiring refund OR webhook handler raised
//
// Detection logic:
//   1. Look up stripe_event_log for any row with payload mentioning
//      this session_id (the webhook handler stamps the session id
//      into the event payload metadata at idempotency-INSERT time).
//   2. If absent → pending (event not received yet).
//   3. If present but processed_at IS NULL → pending (event in flight).
//   4. If present + processed_at IS NOT NULL:
//      4a. Look up companies by stripe_customer_id (extracted from
//          the payload). If found → ready.
//      4b. If not found → failed (handler ran but didn't provision —
//          most likely founding-cap-reached refund-required state).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { routeLogger } from '@/lib/logger';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

interface StatusResponse {
  status: 'pending' | 'ready' | 'failed';
  company_id?: string;
  message?: string;
}

export async function GET(request: Request) {
  const log = routeLogger('GET /api/onboarding/status', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  // Rate limit per-IP. The /setting-up page polls every 5s for up to
  // 60s, so 30 requests per minute is the upper bound for a single
  // happy-path session.
  const ip = getClientIP(request);
  const rl = checkRateLimit(`onboarding.status:${ip}`, {
    maxRequests: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error({}, 'onboarding.status.missing_supabase_env');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Look up the event log row. The webhook handler stamps the session
  // id into payload_summary at idempotency-INSERT time.
  const { data: events, error: eventErr } = await supabase
    .from('stripe_event_log')
    .select('event_id, event_type, processed_at, payload_summary')
    .eq('event_type', 'checkout.session.completed')
    .filter('payload_summary->session_id', 'eq', sessionId)
    .limit(1);

  if (eventErr) {
    log.error({ err: eventErr.message, sessionId }, 'onboarding.status.event_lookup_failed');
    return NextResponse.json({ error: eventErr.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    const response: StatusResponse = { status: 'pending' };
    return NextResponse.json(response);
  }

  const event = events[0];
  if (event.processed_at === null) {
    const response: StatusResponse = { status: 'pending' };
    return NextResponse.json(response);
  }

  // Event processed — look up the company by stripe_customer_id from
  // the payload summary. If found → ready; if not → failed (most
  // likely the founding-cap REFUND_REQUIRED path).
  const customerId = (event.payload_summary as { customer_id?: string } | null)?.customer_id;
  if (!customerId) {
    const response: StatusResponse = {
      status: 'failed',
      message: 'Provisioning failed. Please reply to the welcome email and we’ll sort it manually.',
    };
    return NextResponse.json(response);
  }

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (companyErr) {
    log.error({ err: companyErr.message, customerId }, 'onboarding.status.company_lookup_failed');
    return NextResponse.json({ error: companyErr.message }, { status: 500 });
  }

  if (!company) {
    const response: StatusResponse = {
      status: 'failed',
      message: 'Provisioning failed. Please reply to the welcome email and we’ll sort it manually.',
    };
    return NextResponse.json(response);
  }

  const response: StatusResponse = {
    status: 'ready',
    company_id: company.id as string,
  };
  return NextResponse.json(response);
}
