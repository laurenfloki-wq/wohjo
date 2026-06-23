// Generic fleet bot entrypoint.
//   GET  — invoked by Vercel Cron (Authorization: Bearer CRON_SECRET).
//   POST — manual / on-demand invoke (x-fleet-secret), JSON body is ctx.input.
//
// Looks the bot up in the registry and runs it through the uniform runtime
// (kill switch + enable gate + audit). Gated output goes to the approval queue;
// nothing external is auto-sent here.

import { NextResponse } from 'next/server';
import { routeLogger } from '@/lib/logger';
import { REGISTRY } from '@bots/registry';
import { runBot, type BotContext } from '@bots/runtime';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function dispatch(botId: string, ctx: BotContext) {
  const mod = REGISTRY[botId];
  if (!mod) return NextResponse.json({ error: `unknown bot: ${botId}` }, { status: 404 });
  const result = await runBot(mod, ctx);
  return NextResponse.json({ bot: mod.id, ...result });
}

export async function GET(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const log = routeLogger('GET /api/fleet/run/:botId', request.headers.get('x-request-id'));
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return unauthorized();
  }
  log.info({ botId }, 'fleet.run.cron');
  try {
    return await dispatch(botId, { input: {}, invokedBy: 'cron' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error({ botId, err: message }, 'fleet.run.error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const log = routeLogger('POST /api/fleet/run/:botId', request.headers.get('x-request-id'));
  if (request.headers.get('x-fleet-secret') !== process.env.FLEET_RUN_SECRET) {
    return unauthorized();
  }
  let input: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body === 'object') input = body as Record<string, unknown>;
  } catch {
    // empty / non-JSON body is fine
  }
  log.info({ botId }, 'fleet.run.manual');
  try {
    return await dispatch(botId, { input, invokedBy: 'manual' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error({ botId, err: message }, 'fleet.run.error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
