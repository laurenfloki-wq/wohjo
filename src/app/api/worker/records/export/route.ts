// Worker right-to-export — GET /api/worker/records/export
//
// Layer 3.1 — every worker can download their own complete sealed
// record history at any time, in CSV / JSON / PDF formats,
// REGARDLESS of employer state (active, cancelled, suspended).
//
// Founder direction (Layer 3 Jobs-standard): worker-owned, portable
// records. Workers carry their proof; FLOSMOSIS isn't the
// indemnifier. Even after the company cancels, the worker keeps
// access for 7 years post-employment-end-date.
//
// Query parameters:
//   format    — 'csv' | 'json' | 'pdf-receipts' | 'all' (default 'json')
//   from      — ISO date (YYYY-MM-DD), inclusive (default: all-time)
//   to        — ISO date (YYYY-MM-DD), inclusive (default: today)
//
// Authentication: worker session only. Service-role for the
// underlying query (RLS would also work but we want one explicit
// surface that audits the export).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
// W1.3 (2026-06-10): worker-scoped repositories replace the raw service
// client; identity derives from the verified auth user id.
import { workerByAuthUserId } from '@/lib/db/repositories/workers.repo';
import { workerShiftEventsSelfRepo } from '@/lib/db/repositories/shifts.repo';
import { workerRecordExportsRepo } from '@/lib/db/repositories/exports.repo';
// L2.1 — MFA gate for full-history exports. Day-to-day partial
// exports (a single shift, a recent date range) do NOT require MFA;
// the right-to-export's full-history path does, because it surfaces
// the worker's entire employment record in one download.
import { assertActiveGrant } from '@/lib/auth/worker-mfa';
import { AuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  format: z.enum(['csv', 'json', 'pdf-receipts', 'all']).default('json'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: Request): Promise<Response> {
  const log = routeLogger('GET /api/worker/records/export', req.headers.get('x-request-id'));
  log.info({}, 'request.received');

  // Worker session check.
  const userClient = await createClient();
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    format: url.searchParams.get('format') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query', details: parsed.error.issues }, { status: 400 });
  }
  const { format, from, to } = parsed.data;

  // Resolve the worker record from the auth session — identity-derivation
  // accessor: the verified user id IS the scope, the row can only be the
  // caller's own (column list relocated verbatim).
  const { data: worker, error: workerErr } = await workerByAuthUserId(userRes.user.id);
  if (workerErr || !worker) {
    return NextResponse.json({ error: 'No worker record matches your session' }, { status: 404 });
  }

  // L2.1 MFA gate. The full-history export ('all') and any export
  // without an explicit `from` date is treated as a full-history
  // request and requires an EXPORT_FULL grant. A bounded export
  // (both `from` and `to` set, and the requested span <=31 days)
  // is treated as a day-to-day operation and is NOT MFA-gated.
  const isBounded =
    typeof from === 'string' &&
    typeof to === 'string' &&
    (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000) <= 31;
  const isFullHistory = format === 'all' || !isBounded;
  if (isFullHistory) {
    try {
      await assertActiveGrant(log, worker.id, 'EXPORT_FULL');
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return NextResponse.json(
          {
            error: err.code,
            message: err.message,
            next_step: {
              method: 'POST',
              path: '/api/worker/mfa/issue',
              body: { challenge_for: 'EXPORT_FULL' },
              hint: 'Full-history exports require email verification. Request a code, verify, then retry.',
            },
          },
          { status: err.status },
        );
      }
      throw err;
    }
  }

  // Retention check — if records_retained_until is in the past, the
  // records may be cold-archived. Per CLAUDE.md rule 6 they are NOT
  // deleted, but a cold-archive recovery is required for access. For
  // MVP we fail loudly with a recovery instruction.
  if (worker.records_retained_until) {
    const today = new Date().toISOString().slice(0, 10);
    if (worker.records_retained_until < today) {
      log.warn({ workerId: worker.id, retainedUntil: worker.records_retained_until }, 'worker.export.cold_archive');
      return NextResponse.json({
        error: 'Records are in cold archive',
        retained_until: worker.records_retained_until,
        message: 'Your records are preserved but require manual retrieval. Contact support@flosmosis.com.',
      }, { status: 410 });
    }
  }

  // Fetch all sealed shift events for this worker, optionally filtered by date.
  let q = workerShiftEventsSelfRepo(worker.id).recordsChainQuery();
  if (from) q = q.gte('created_at', from + 'T00:00:00+10:00');
  if (to)   q = q.lt('created_at',  to   + 'T23:59:59+10:00');

  const { data: events, error: eventsErr } = await q;
  if (eventsErr) {
    log.error({ err: eventsErr }, 'worker.export.events_query_failed');
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
  const eventCount = events?.length ?? 0;

  // Audit-log the export (per L3.1 evidence cadence — worker has
  // a record of every export they performed).
  const wreRepo = workerRecordExportsRepo(worker.id);
  await wreRepo.insertExportRecord({
    format,
    date_from: from ?? null,
    date_to: to ?? null,
    shift_count: eventCount,
    ip_address: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    user_agent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
  });

  // ── Format-specific responses ────────────────────────────────────
  const filenameStem = `flostruction-records-${worker.employee_id || worker.id.slice(0, 8)}`;

  if (format === 'json') {
    const payload = {
      generated_at: new Date().toISOString(),
      worker: {
        first_name: worker.first_name,
        last_name: worker.last_name,
        employee_id: worker.employee_id,
        phone: worker.phone,
        email: worker.email,
      },
      retention: {
        employment_end_date: worker.employment_end_date,
        records_retained_until: worker.records_retained_until,
      },
      event_count: eventCount,
      events: events ?? [],
      verification_instructions: {
        verifier_url: 'https://flosmosis.com/wles/verifier',
        cli_command: 'node wles-v1-verify.mjs <this-file>',
      },
    };
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameStem}.json"`,
      },
    });
  }

  if (format === 'csv') {
    const header = ['event_id','event_type','timestamp_aest','event_hash','previous_event_hash','spec_version'];
    const rows = (events ?? []).map((e: any) => [
      e.id, e.event_type, e.created_at, e.event_hash, e.previous_event_hash ?? '', e.spec_version ?? '0',
    ].map((v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const bom = '\uFEFF';  // Excel-friendly UTF-8 BOM (per P7 export findings)
    const csv = bom + [header.join(','), ...rows].join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameStem}.csv"`,
      },
    });
  }

  if (format === 'pdf-receipts' || format === 'all') {
    // Phase 1.5 — PDF receipts bundle generation. Currently scaffold:
    // returns a pointer to the per-shift receipt URLs the worker can
    // open + print one at a time. Full ZIP-of-PDFs comes with the
    // PDF-generator wiring in onboarding step 4.
    const shiftIds = Array.from(new Set(
      (events ?? [])
        .map((e: any) => e.event_data?.shift_id)
        .filter(Boolean),
    ));
    return NextResponse.json({
      format_status: 'scaffold — full PDF bundle is Phase 1.5 work',
      worker_id: worker.id,
      receipt_urls: shiftIds.map((sid) => `https://flostruction.com/receipt/${sid}`),
      note: format === 'all'
        ? 'For now, request the JSON or CSV format. PDF bundle ships in Phase 1.5.'
        : 'For now, open each receipt URL above and print individually. PDF bundle ships in Phase 1.5.',
    }, { status: 200 });
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
}
