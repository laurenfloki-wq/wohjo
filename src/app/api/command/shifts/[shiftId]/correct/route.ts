// POST /api/command/shifts/[shiftId]/correct
//
// Dispute-correction workflow Phase 1 — admin-issued corrective shift_event.
// Per ~/FLOSMOSIS/operations/dispute-correction-workflow-v1.md, this
// endpoint extends the immutable hash chain with a corrective record;
// the original shift_event is NEVER modified.
//
// Three correction types supported in Phase 1:
//   - CORRECTION             Scenario A: admin agrees with a worker dispute
//   - BUG_CORRECTION         Scenario B: admin discovers a system bug post-seal
//   - SUPERVISOR_RE_APPROVAL Scenario C: supervisor approval needs re-approval
//
// Each correction event:
//   - extends the hash chain via the standard previous_event_hash
//     mechanism (SHA-256 over canonical event data per generateEventHash)
//   - sets parent_shift_event_id pointing at the original shift_event
//   - sets correction_reason documenting WHY (admin's note, free-text)
//   - logs the admin user as created_by
//
// Hard rules per CLAUDE.md non-negotiable #6 (no data ever deleted) and
// the dispute-correction workflow v1:
//   - Original shift_events row is NEVER updated
//   - The shifts aggregate row is NEVER updated by this endpoint
//     (shifts denormalised cache update is Phase 2 work — needs UX
//     decisions about what "current state" means for corrections)
//   - Corrective event must have non-empty correction_reason (zod
//     enforcement; PG CHECK enforces at the DB layer too — see
//     migrations/202605011000_dispute_correction_phase1.sql)
//
// Joao E2E test sacred zone untouched — this endpoint is the
// /command admin surface for corrections, not part of the worker-side
// /field flow or the supervisor SMS approval path.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { generateEventHash } from '@/lib/wles/hash';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';

const CorrectionSchema = z.object({
  correction_type: z.enum(['CORRECTION', 'BUG_CORRECTION', 'SUPERVISOR_RE_APPROVAL']),
  parent_shift_event_id: z.string().uuid(
    'parent_shift_event_id must be a UUID identifying the original event being corrected'
  ),
  correction_reason: z.string().min(1, 'correction_reason is required').max(2000),
  /**
   * Optional structured corrected fields. Free-form jsonb so each
   * correction type can carry the fields that matter (CORRECTION may
   * carry corrected_hours, corrected_start_time; BUG_CORRECTION may
   * carry corrected_geofence_decision; SUPERVISOR_RE_APPROVAL may
   * carry the new supervisor_id). Phase 2 normalises this into typed
   * sub-schemas as the workflow firms up.
   */
  corrected_data: z.unknown().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const log = routeLogger(
    'POST /api/command/shifts/:shiftId/correct',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'POST' }, 'request.received');

  const { shiftId } = await params;
  if (!shiftId) {
    return NextResponse.json({ error: 'shiftId is required' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = CorrectionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Resolve the shift first — any tenant-isolation check is anchored
  // to the shift's company_id.
  const { data: shift, error: shiftError } = await supabase
    .from('shifts')
    .select('id, company_id, worker_id, site_id, receipt_id')
    .eq('id', shiftId)
    .single();

  if (shiftError || !shift) {
    log.warn({ shiftId, err: shiftError?.message }, 'correction.shift_not_found');
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  // GAP-A3-001 closure: admin must be a member of the shift's company.
  let adminUserId: string;
  try {
    const session = await requireCompanyMembership(log, shift.company_id);
    adminUserId = session.userId;
  } catch (err) {
    return authErrorResponse(err);
  }

  // Verify the parent_shift_event_id (a) exists, (b) belongs to the
  // same tenant. Tenant-isolation belt-and-braces.
  const { data: parentEvent, error: parentError } = await supabase
    .from('shift_events')
    .select('id, company_id, worker_id, site_id, event_hash')
    .eq('id', parsed.data.parent_shift_event_id)
    .single();

  if (parentError || !parentEvent) {
    log.warn(
      { parentEventId: parsed.data.parent_shift_event_id, err: parentError?.message },
      'correction.parent_event_not_found',
    );
    return NextResponse.json(
      { error: 'parent_shift_event_id not found' },
      { status: 404 },
    );
  }
  if (parentEvent.company_id !== shift.company_id) {
    log.warn(
      {
        parentEventId: parentEvent.id,
        parentCompany: parentEvent.company_id,
        shiftCompany: shift.company_id,
      },
      'correction.tenant_mismatch',
    );
    return NextResponse.json(
      { error: 'parent_shift_event_id does not belong to this shift’s tenant' },
      { status: 403 },
    );
  }

  // Read the chain tail for this worker so we can extend with
  // previous_event_hash. Mirrors the adjust-route pattern (line 91-99
  // of /api/command/shifts/:shiftId/adjust/route.ts).
  const { data: lastEvent } = await supabase
    .from('shift_events')
    .select('event_hash')
    .eq('worker_id', shift.worker_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const previousHash = lastEvent?.event_hash ?? null;

  const now = new Date();
  const eventData = {
    shift_id: shift.id,
    receipt_id: shift.receipt_id,
    correction_type: parsed.data.correction_type,
    parent_shift_event_id: parsed.data.parent_shift_event_id,
    correction_reason: parsed.data.correction_reason,
    corrected_data: parsed.data.corrected_data ?? {},
    issued_by_admin_user_id: adminUserId,
  };

  const hash = generateEventHash({
    company_id: shift.company_id,
    worker_id: shift.worker_id,
    site_id: shift.site_id,
    event_type: parsed.data.correction_type,
    event_data: eventData,
    created_at: now,
  });

  const { data: insertedEvent, error: insertError } = await supabase
    .from('shift_events')
    .insert({
      company_id: shift.company_id,
      worker_id: shift.worker_id,
      site_id: shift.site_id,
      event_type: parsed.data.correction_type,
      event_data: eventData,
      device_metadata: {},
      event_hash: hash,
      previous_event_hash: previousHash,
      created_at: now.toISOString(),
      created_by: adminUserId,
      parent_shift_event_id: parsed.data.parent_shift_event_id,
      correction_reason: parsed.data.correction_reason,
    })
    .select('id, event_hash')
    .single();

  if (insertError || !insertedEvent) {
    log.error(
      { err: insertError?.message, shiftId, correctionType: parsed.data.correction_type },
      'correction.insert_failed',
    );
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to record correction' },
      { status: 500 },
    );
  }

  log.info(
    {
      shiftId,
      correctionType: parsed.data.correction_type,
      newEventId: insertedEvent.id,
      parentEventId: parsed.data.parent_shift_event_id,
    },
    'correction.recorded',
  );

  return NextResponse.json({
    success: true,
    correction: {
      id: insertedEvent.id,
      event_hash: insertedEvent.event_hash,
      previous_event_hash: previousHash,
      parent_shift_event_id: parsed.data.parent_shift_event_id,
      correction_type: parsed.data.correction_type,
    },
  }, { status: 201 });
}
