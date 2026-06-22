// Fleet approval queue API (the front door for bot 57).
//   GET  — list pending approvals.
//   POST — resolve one: { approvalId, decision: 'approved'|'rejected', resolvedBy }.
// On approve the parked durable flow resumes; on reject the compensating action
// is enqueued (handled in bot 57's resolve).

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { listPending } from '@platform/hitl';
import { resolve } from '@bots/57-approval-router/handler';

function authed(request: Request): boolean {
  return request.headers.get('x-fleet-secret') === process.env.FLEET_RUN_SECRET;
}

export async function GET(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pending = await listPending();
  return NextResponse.json({ pending });
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/fleet/approvals', request.headers.get('x-request-id'));
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as {
    approvalId?: string;
    decision?: 'approved' | 'rejected';
    resolvedBy?: string;
    compensationTopic?: string;
  };
  if (!body.approvalId || (body.decision !== 'approved' && body.decision !== 'rejected')) {
    return NextResponse.json({ error: 'approvalId and decision required' }, { status: 400 });
  }
  const opts = body.compensationTopic ? { compensationTopic: body.compensationTopic } : {};
  const next = await resolve(body.approvalId, body.decision, body.resolvedBy ?? 'director', opts);
  log.info(
    { approvalId: body.approvalId, decision: body.decision, next: next.kind },
    'fleet.approval.resolved',
  );
  return NextResponse.json({ ok: true, next });
}
