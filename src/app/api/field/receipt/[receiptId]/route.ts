// Flostruction Field — Receipt Detail API
// GET /api/field/receipt/[receiptId]
// Returns shift details + intelligence status for the receipt screen.
// Intelligence status: 'VERIFIED' | 'FLAGGED' | 'PENDING'
// VERIFIED = INTELLIGENCE_CLEAR event exists for this shift
// FLAGGED  = ANOMALY_FLAG event exists (HIGH or MEDIUM) — supervisor review needed
// PENDING  = Intelligence analysis not yet completed

// Day 5 P1.3 — GAP-A3-002 closure. Receipt owner verified against session.

import { NextResponse } from 'next/server';
// W1.4 (2026-06-10): worker-self repositories replace the raw client.
import { workerSelfRepo } from '@/lib/db/repositories/workers.repo';
import {
  workerShiftsSelfRepo,
  commitHashForShift,
  intelligenceEventForShift,
} from '@/lib/db/repositories/shifts.repo';
import { siteNameAddressById } from '@/lib/db/repositories/sites.repo';
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

  // 1. Fetch shift scoped to session worker — cross-worker probes collapse to 404.
  const { data: shift, error: shiftError } = await workerShiftsSelfRepo(
    sessionWorkerId,
  ).getByReceiptId(receiptId);

  if (shiftError || !shift) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  // 2. Fetch worker name + pay rate
  // shift.worker_id ≡ sessionWorkerId (the receipt fetch predicates on it).
  const { data: worker } = await workerSelfRepo(sessionWorkerId).getReceiptProfile();

  // 3. Fetch site name + address (B2 receipt spec)
  const { data: site } = await siteNameAddressById(shift.site_id ?? '');

  // 3b. Fetch the SHIFT_COMMIT event hash for the tamper-evidence
  // block (B2). Truncated to first 16 chars client-side.
  const { data: commitEvent } = await commitHashForShift(shift.id);

  // 4. Check for INTELLIGENCE_CLEAR or ANOMALY_FLAG events for this shift
  // Use Supabase .filter() to query jsonb path event_data->>'shift_id'
  const { data: clearEvent } = await intelligenceEventForShift('INTELLIGENCE_CLEAR', shift.id);

  const { data: flagEvent } = await intelligenceEventForShift('ANOMALY_FLAG', shift.id);

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
