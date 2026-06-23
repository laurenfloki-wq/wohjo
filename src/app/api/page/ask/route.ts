// Ask — Phase 3. Natural language over the record. READ-ONLY by law:
// the model sees a bounded set of this company's rows and must answer
// only from them, citing receipts. No tool use, no writes, flags stay
// informational. Returns 503 not_connected until ANTHROPIC_API_KEY is
// provisioned (founder action; documented in docs/secrets-inventory.md).
//
// Cost rail (2026-06-13): a per-operator daily cap fronts every paid
// Anthropic call so one signed-in operator cannot run up the shared key.
// Durable (rate_limit_buckets) so the count is global, not per warm
// instance. This is the in-app backstop; the hard ceiling is the monthly
// spend cap set on the key itself in the Anthropic console.

import { NextResponse } from 'next/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { authErrorResponse } from '@/lib/auth/response';
import { routeLogger } from '@/lib/logger';
import { pageRepo } from '@/lib/db/repositories/page.repo';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';

export const dynamic = 'force-dynamic';

// Per-operator daily question cap. Generous for genuine use, fatal to
// abuse: the model is Haiku with max_tokens 500, so even a full day at
// the cap is cents — this exists so a single operator cannot empty the
// shared monthly budget on their own.
const ASK_DAILY_LIMIT_PER_OPERATOR = 40;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface AskBody {
  question?: unknown;
}

interface NameRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Sydney calendar day (YYYY-MM-DD). Keying the bucket by day gives a clean
// midnight-Sydney reset independent of the rolling window length.
function sydneyDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
}

export async function POST(req: Request) {
  const log = routeLogger('POST /api/page/ask', null);
  let companyId: string;
  let userId: string;
  try {
    ({ companyId, userId } = await getCompanyIdForSession(log));
  } catch (err) {
    return authErrorResponse(err);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return NextResponse.json({ error: 'not_connected' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as AskBody;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  if (question.length === 0) {
    return NextResponse.json({ error: 'A question is required' }, { status: 400 });
  }

  // Cost rail: per-operator daily cap BEFORE any paid call. A connected key
  // with no question, or no key at all, returns above and never reaches here,
  // so neither path consumes quota. Durable so the count is shared across
  // serverless instances rather than reset on every cold start.
  const limit = await checkRateLimitDurable(`ask:${companyId}:${userId}:${sydneyDay()}`, {
    windowMs: ONE_DAY_MS,
    maxRequests: ASK_DAILY_LIMIT_PER_OPERATOR,
  });
  if (!limit.allowed) {
    log.warn({ companyId, userId }, 'ask.daily_limit_reached');
    return NextResponse.json(
      {
        error: 'daily_limit',
        message:
          "You've reached today's limit for Ask. It refreshes tomorrow — the sealed records are here to read in the meantime.",
        resetAt: new Date(limit.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  const repo = pageRepo(companyId);
  const [eventsRes, shiftsRes, exportRes] = await Promise.all([
    repo.eventsSince(isoDaysAgo(60)),
    repo.shiftsBetween(isoDaysAgo(60).slice(0, 10), new Date().toISOString().slice(0, 10)),
    repo.latestExport(),
  ]);
  const events = (eventsRes.data ?? []) as Array<{
    id: string;
    event_type: string;
    created_at: string;
    event_data: Record<string, unknown> | null;
    worker_id: string | null;
  }>;
  const shifts = (shiftsRes.data ?? []) as Array<{
    id: string;
    status: string;
    total_hours: number | string | null;
    shift_date: string | null;
    receipt_id: string | null;
    worker_id: string | null;
  }>;

  const workerIds = [
    ...new Set(
      [...events, ...shifts].map((r) => r.worker_id).filter((v): v is string => v !== null),
    ),
  ];
  const namesRes = workerIds.length > 0 ? await repo.workerNames(workerIds) : { data: [] };
  const names: Record<string, string> = {};
  for (const w of (namesRes.data ?? []) as NameRow[]) {
    names[w.id] = [w.first_name, w.last_name].filter(Boolean).join(' ');
  }

  const shiftLines = shifts
    .slice(0, 200)
    .map(
      (s) =>
        `${s.receipt_id ?? s.id.slice(0, 8)} | ${s.shift_date ?? '?'} | ${names[s.worker_id ?? ''] ?? 'unknown worker'} | ${s.total_hours ?? '?'}h | ${s.status}`,
    )
    .join('\n');
  const eventLines = events
    .slice(0, 200)
    .map((e) => {
      const receipt =
        typeof e.event_data?.['receipt_id'] === 'string'
          ? (e.event_data['receipt_id'] as string)
          : '';
      return `${e.created_at} | ${e.event_type} | ${names[e.worker_id ?? ''] ?? ''} | ${receipt}`;
    })
    .join('\n');
  const exportLine =
    exportRes.data !== null && exportRes.data !== undefined
      ? JSON.stringify(exportRes.data)
      : 'none';

  const system = [
    'You are Ask, the read-only voice of a sealed labour-records system for one company.',
    'Answer ONLY from the rows provided. Never invent names, numbers, hours, or dates.',
    'If the rows cannot answer the question, say so plainly and suggest what record would.',
    'Voice: direct, warm, factual Australian English. No emojis. No exclamation marks.',
    'Keep answers to a few sentences. End with "Refs:" followed by the receipt ids or dates you used, comma-separated, or "none".',
  ].join(' ');

  const userContent = `SHIFTS (receipt | date | worker | hours | status):\n${shiftLines}\n\nEVENTS (time | type | worker | receipt):\n${eventLines}\n\nLATEST EXPORT: ${exportLine}\n\nQUESTION: ${question}`;

  let answer = '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!res.ok) {
      log.error({ status: res.status }, 'ask.anthropic_error');
      return NextResponse.json({ error: 'ask_failed' }, { status: 502 });
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    answer = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim();
  } catch (err) {
    log.error({ err }, 'ask.anthropic_unreachable');
    return NextResponse.json({ error: 'ask_failed' }, { status: 502 });
  }

  let refs = '';
  const refMatch = answer.match(/Refs:\s*(.+)\s*$/);
  if (refMatch !== null) {
    refs = (refMatch[1] ?? '').trim();
    answer = answer.slice(0, refMatch.index).trim();
  }
  return NextResponse.json({ answer, refs });
}
