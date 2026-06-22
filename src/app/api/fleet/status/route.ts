// Fleet status API — read-only operational view (is it running, what has it done,
// what is it costing). Auth: x-fleet-secret. Backs the /fleet dashboard and is
// handy for a PowerShell/curl health poll.

import { NextResponse } from 'next/server';
import { fleetActivity, recentLedger, pendingApprovalCount, fleetCost } from '@platform/obs';
import { REGISTRY } from '@bots/registry';

export async function GET(request: Request) {
  if (request.headers.get('x-fleet-secret') !== process.env.FLEET_RUN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [activity, recent, pending, costAud] = await Promise.all([
    fleetActivity(),
    recentLedger(50),
    pendingApprovalCount(),
    fleetCost(),
  ]);
  return NextResponse.json({
    botsRegistered: Object.keys(REGISTRY).length,
    pendingApprovals: pending,
    fleetCostAudThisMonth: costAud,
    activity,
    recent,
    ts: new Date().toISOString(),
  });
}
