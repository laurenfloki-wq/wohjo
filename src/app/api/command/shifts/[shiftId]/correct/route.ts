// POST /api/command/shifts/[shiftId]/correct
//
// Dispute-correction workflow Phase 1 — admin-issued corrective shift_event.
// (Full workflow header preserved in git history; hard rules unchanged:
// original shift_events row NEVER updated; shifts aggregate NEVER updated
// by this endpoint; correction_reason mandatory, PG CHECK enforced.)
//
// CP-1 slice 2b (2026-06-10): BOTH unscoped reads became spine-approved
// seams — shiftAuthLookup (shift) and parentEventAuthLookup (parent
// shift_events row; structural cross-tenant guard with discriminated
// result preserving the 404-missing vs 403-mismatch distinction).
// Chain-tail relocated verbatim. Behaviour unchanged.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEventHash } from '@/lib/wles/hash';
import { requireCompanyMembership } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import {
  shiftAuthLookup,
  parentEventAuthLookup,
  workerChainTail,
  shiftsMutationRepo,
  shiftEventsMutationRepo,
} from '@/lib/db/repositories/shifts.repo';

const CorrectionSchema = z.object({
  correction_type: z.enum(['CORRECTION', 'BUG_CORRECTION', 'SUPERVISOR_RE_APPROVAL']),
  parent_shift_event_id: z.string().uuid(
    'parent_shift_event_id must be a UUID identifying the original event being corrected'
  ),
  correction_reason: z.string().min(1, 'correction_reason is required').max(2000),
  /**
   * Optional structured corrected fields. Free-form jsonb so each
   * correction type can carry the fields that matter; Phase 2 normalises
   * this into typed sub-schemas as the workflow firms up.
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

  // SEAM 1: unscoped shift auth lookup (id + company_id only) — any
  // tenant-isolation check is anchored to the shift's company_id.
  const { data: authRow, error: authErr } = await shiftAuthLookup(shiftId);
  if (authErr || !authRow) {
    log.warn({ shiftId, err: authErr?.message }, 'correction.shift_not_found');
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  // GAP-A3-001 closure: admin must be a member of the shift's company.
  let adminUserId: string;
  try {
    const session = await requireCompanyMembership(log, authRow.company_id);
    adminUserId = session.userId;
  } catch (err) {
    return authErrorResponse(err);
  }

  const repo = shiftsMutationRepo(authRow.company_id);
  const evRepo = shiftEventsMutationRepo(authRow.company_id);

  // Post-membership re-read.
  const { data: shift, error: shiftError } = await repo.getForCorrect(shiftId);
  if (shiftError || !shift) {
    log.warn({ shiftId, err: shiftError?.message }, 'correction.shift_not_found');
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  // SEAM 2: parent event lookup with STRUCTURAL cross-tenant guard —
  // the accessor cannot return a cross-tenant parent. Discriminated
  // result keeps the 404 (missing) vs 403 (mismatch) responses intact;
  // the mismatch warn-log is emitted inside the accessor.
  const parent = await parentEventAuthLookup(
    parsed.data.parent_shift_event_id,
    authRow.company_id,
    log,
  );
  if (parent.crossTenant) {
    return NextResponse.json(
      { error: 'parent_shift_event_id does not belong to this shift’s tenant' },
      { status: 403 },
    );
  }
  if (!parent.event) {
    log.warn(
      { parentEventId: parsed.data.parent_shift_event_id },
      'correction.parent_event_not_found',
    );
    return NextResponse.json(
      { error: 'parent_shift_event_id not found' },
      { status: 404 },
    );
  }

  // Read the chain tail for this worker so we can extend with
  // previous_event_hash. Relocated verbatim (mirrors the adjust route).
  const { data: lastEvent } = await workerChainTail(shift.worker_id);

  const previousHash = (lastEvent as { event_hash: string } | null)?.event_hash ?? null;

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
    company_id: authRow.company_id,
    worker_id: shift.worker_id,
    site_id: shift.site_id,
    event_type: parsed.data.correction_type,
    event_data: eventData,
    created_at: now,
  });

  const { data: insertedEvent, error: insertError } = await evRepo.insertCorrectionEvent({
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
  });

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
