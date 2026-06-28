// POST /api/exposure/score — server-side scoring (§3, slice b).
//
// The client sends answers; the server returns the scored result. Scoring runs
// here so the rule set (weights, thresholds, facts) isn't exposed client-side
// and the result can't be trivially gamed. No persistence — that's the lead
// endpoint. Public + unauthenticated, so it's rate-limited and size-bounded.

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { ScoreRequestSchema } from '@/lib/exposure/schema';
import { scoreExposure } from '@/lib/exposure/score';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const log = routeLogger('POST /api/exposure/score', request.headers.get('x-request-id'));

  const ip = getClientIP(request);
  const rl = checkRateLimit(`exposure-score:${ip}`, { maxRequests: 40, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    log.warn({ ip }, 'exposure.score.rate_limit.exceeded');
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again shortly.' }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = ScoreRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
  }

  // The founder hand-off opener is internal; never return it to the browser.
  const result = scoreExposure(parsed.data.answers);
  const { founderOpener: _omit, ...publicResult } = result;
  void _omit;

  log.info(
    { overall: result.overall, biggestGap: result.biggestGap ?? 'none', version: result.version },
    'exposure.score.ok',
  );
  return NextResponse.json({ result: publicResult });
}
