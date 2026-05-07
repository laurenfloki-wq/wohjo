// Flostruction Field — Receipt Detail API
// GET /api/field/receipt/[receiptId]
// Returns shift details + intelligence status for the receipt screen.
// Intelligence status: 'VERIFIED' | 'FLAGGED' | 'PENDING'
// VERIFIED = INTELLIGENCE_CLEAR event exists for this shift
// FLAGGED  = ANOMALY_FLAG event exists (HIGH or MEDIUM) — supervisor review needed
// PENDING  = Intelligence analysis not yet completed

// Day 5 P1.3 — GAP-A3-002 closure. Receipt owner verified against session.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireWorkerIdentity } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';

import { routeLogger } from '@/lib/logger';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> }
) {
  const log = routeLogger('GET /api/field/receipt/:receiptId', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');

  let sessionWorkerId: string;
  try {
    ({ workerId: sessionWorkerId } = await requireWorkerIdentity(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const { receiptId } = await params;

  if (!receiptId) {
    return NextResponse.json({ error: 'receiptId required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. Fetch shift scoped to session worker — cross-worker probes collapse to 404.
  const { data: shift, error: shiftError } = await supabase
    .from('shifts')
    .select(`
      id, receipt_id, shift_date, start_time, end_time,
      break_minutes, total_hours, status, confidence_score,
      anomaly_flags, worker_note, worker_id, site_id, company_id,
      created_at
    `)
    .eq('receipt_id', receiptId)
    .eq('worker_id', sessionWorkerId)
    .maybeSingle();

  if (shiftError || !shift) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  // 2. Fetch worker name + pay rate
  const { data: worker } = await supabase
    .from('workers')
    .select('first_name, last_name, pay_rate')
    .eq('id', shift.worker_id)
    .single();

  // 3. Fetch site name + address (B2 receipt spec)
  const { data: site } = await supabase
    .from('sites')
    .select('name, address')
    .eq('id', shift.site_id ?? '')
    .maybeSingle();

  // 3b. Fetch the SHIFT_COMMIT event hash for the tamper-evidence
  // block (B2). Truncated to first 16 chars client-side.
  const { data: commitEvent } = await supabase
    .from('shift_events')
    .select('event_hash')
    .eq('event_type', 'SHIFT_COMMIT')
    .filter('event_data->>shift_id', 'eq', shift.id)
    .maybeSingle();

  // 4. Check for INTELLIGENCE_CLEAR or ANOMALY_FLAG events for this shift
  // Use Supabase .filter() to query jsonb path event_data->>'shift_id'
  const { data: clearEvent } = await supabase
    .from('shift_events')
    .select('id')
    .eq('event_type', 'INTELLIGENCE_CLEAR')
    .filter('event_data->>shift_id', 'eq', shift.id)
    .maybeSingle();

  const { data: flagEvent } = await supabase
    .from('shift_events')
    .select('id')
    .eq('event_type', 'ANOMALY_FLAG')
    .filter('event_data->>shift_id', 'eq', shift.id)
    .maybeSingle();

  // 5. Resolve intelligence status
  let intelligenceStatus: 'VERIFIED' | 'FLAGGED' | 'PENDING';
  if (clearEvent) {
    intelligenceStatus = 'VERIFIED';
  } else if (flagEvent) {
    intelligenceStatus = 'FLAGGED';
  } else {
    intelligenceStatus = 'PENDING';
  }

  const totalHours = parseFloat(shift.total_hours ?? '0');

  return NextResponse.json({
    shift: {
      id: shift.id,
      receipt_id: shift.receipt_id,
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes,
      total_hours: totalHours.toFixed(2),
      status: shift.status,
      worker_note: shift.worker_note,
    },
    worker: {
      first_name: worker?.first_name ?? '',
      last_name: worker?.last_name ?? '',
      pay_rate: '0.00', // PARKING LOT: pay_rate retained in schema for Employment Hero export, not displayed to workers
    },
    site_name: site?.name ?? null,
    site_address: site?.address ?? null,
    // A7: receipt is a record of a COMPLETED shift. If end_time is
    // null, the client redirects to /field/home. We return the flag
    // explicitly so the client can render a clean redirect rather
    // than partial data.
    is_complete: shift.end_time !== null,
    // B2: tamper-evidence block shows the first 16 chars of the
    // SHIFT_COMMIT event hash. Null when the commit event is missing
    // (rare degraded state from shift/end route — chain-verify cron
    // surfaces these).
    chain_hash_prefix: commitEvent?.event_hash
      ? (commitEvent.event_hash as string).slice(0, 16)
      : null,
    intelligence_status: intelligenceStatus,
  });
}
