// Flostruction Intelligence — Analysis API Route
// POST /api/intelligence/analyse/[shiftId]
// Triggered by Supabase webhook on SHIFT_COMMIT event insert.
// Also callable directly for testing. Server-side only — uses service role key.
// Non-negotiable: NEVER returns an error that blocks the shift. Analysis failures are silent.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { analyseShift } from '@/lib/intelligence/analyse';

import { routeLogger } from '@/lib/logger';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('POST /api/intelligence/analyse/:shiftId', request.headers.get('x-request-id'));
  log.info({ method: 'POST' }, 'request.received');
  const { shiftId } = await params;

  if (!shiftId) {
    return NextResponse.json({ error: 'shiftId required' }, { status: 400 });
  }

  // Validate webhook secret if called from Supabase webhook
  // Supabase sends Authorization header with the webhook secret
  const authHeader = request.headers.get('authorization');
  const webhookSecret = process.env.CRON_SECRET;
  if (webhookSecret && authHeader && authHeader !== `Bearer ${webhookSecret}`) {
    // Allow direct calls without auth (e.g. from field shift commit route)
    // Only block if auth header is present but wrong
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const result = await analyseShift(supabase, shiftId);

    return NextResponse.json({
      success: true,
      shift_id: result.shift_id,
      confidence_score: result.confidence_score,
      flag_count: result.flags.length,
      cleared: result.cleared,
      flags: result.flags.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        explanation: f.explanation,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    // Log but never surface errors to the worker — analysis failure is non-blocking
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing from Flostruction Command
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shiftId: string }> }
) {
  const log = routeLogger('GET /api/intelligence/analyse/:shiftId', request.headers.get('x-request-id'));
  log.info({ method: 'GET' }, 'request.received');
  const { shiftId } = await params;
  if (!shiftId) {
    return NextResponse.json({ error: 'shiftId required' }, { status: 400 });
  }

  // Security: require CRON_SECRET for direct access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, confidence_score, anomaly_flags, status, receipt_id')
    .eq('id', shiftId)
    .single();

  if (!shift) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
  }

  return NextResponse.json({ shift });
}
