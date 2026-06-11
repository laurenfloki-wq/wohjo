// ---------------------------------------------------------------
// FLOS-SHA-001 / W3-SG-4 — /api/cron/substrate-health
// Daily substrate-anchor verification (M3). Reads
// v_anchor_verification — the view recomputes each anchor's
// fingerprint INLINE in its own DDL (the forcing function: anchors
// cannot be added or altered by data-only writes) — and records the
// outcome in substrate_health_log (check_name 'anchor_fingerprint').
//
// Status mapping (per the M3 migration contract):
//   every anchor matches=true            → GREEN
//   any anchor matches=false             → RED   (+ alert rows)
//   any anchor matches IS NULL           → ERROR (anchor without an
//     inline formula in the view DDL — a code-change gap, not data
//     tampering; surfaced loudly so it can never sit silent)
//
// Pure detection path. Never mutates substrate_anchors or
// shift_events. Companion to /api/cron/verify-hashes (dual-mode
// chain verification), which records chain_integrity_shift_events
// into the same log. Email/Sentry escalation lands in W5 — the RED
// alert row in admin_access_log is the durable record today.
// ---------------------------------------------------------------

import { NextResponse } from 'next/server';
// W3 (2026-06-11): SYSTEM surface — cross-company BY DESIGN
// (CRON_SECRET-gated cron schedule, sessionless).
import { getServiceClientForSystemJob } from '@/lib/db/service-client';
import { routeLogger } from '@/lib/logger';
// W5/SG-6: best-effort human ping when any check goes RED — the durable
// records (alert rows + health log) are written first, below.
import { postOpsAlert } from '@/lib/observability/slack';

const SYSTEM_USER_UUID = '00000000-0000-0000-0000-000000000000';

interface AnchorRow {
  id: string;
  scope_text: string;
  expected_fingerprint: string;
  expected_count: number;
  bound_at: string;
  actual_fingerprint: string | null;
  actual_count: number | null;
  matches: boolean | null;
  recomputed_at: string;
}

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/cron/substrate-health',
    request.headers.get('x-request-id'),
  );
  log.info({ method: 'GET' }, 'request.received');

  // Auth — Vercel-canonical Authorization: Bearer pattern (standardised
  // across all cron routes 2026-04-29 per substrate-DD audit).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = getServiceClientForSystemJob();

  try {
    const { data, error } = await supabase.from('v_anchor_verification').select('*');
    if (error) throw new Error(`v_anchor_verification: ${error.message}`);
    const anchors = (data ?? []) as AnchorRow[];

    const mismatched = anchors.filter((a) => a.matches === false);
    const unverifiable = anchors.filter((a) => a.matches === null);
    const status =
      anchors.length === 0
        ? 'ERROR' // zero anchors would itself be a substrate regression
        : mismatched.length > 0
          ? 'RED'
          : unverifiable.length > 0
            ? 'ERROR'
            : 'GREEN';

    // Order matters: durable alert rows first, then the health record.
    if (mismatched.length > 0 || unverifiable.length > 0) {
      const alertRows = [...mismatched, ...unverifiable].map((a) => ({
        admin_user_id: SYSTEM_USER_UUID,
        customer_id_accessed: null,
        resource_type: 'substrate_anchors',
        resource_id: null, // anchor ids are text; carried in reason_code
        action: 'alert',
        reason_code:
          a.matches === false
            ? `ANCHOR_MISMATCH:${a.id}`
            : `ANCHOR_UNVERIFIABLE:${a.id}`,
        source_ip: null,
      }));
      const { error: alertErr } = await supabase.from('admin_access_log').insert(alertRows);
      if (alertErr) throw new Error(`alert rows: ${alertErr.message}`);
      log.error(
        { mismatched: mismatched.map((a) => a.id), unverifiable: unverifiable.map((a) => a.id) },
        'substrate_health.anchor_alert',
      );
    }

    const { error: healthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'anchor_fingerprint',
      status,
      detail: {
        anchors: anchors.map((a) => ({
          id: a.id,
          matches: a.matches,
          actual_fingerprint: a.actual_fingerprint,
          actual_count: a.actual_count,
          recomputed_at: a.recomputed_at,
        })),
        mismatched: mismatched.map((a) => a.id),
        unverifiable: unverifiable.map((a) => a.id),
      },
      baseline: {
        anchors: anchors.map((a) => ({
          id: a.id,
          expected_fingerprint: a.expected_fingerprint,
          expected_count: a.expected_count,
          bound_at: a.bound_at,
        })),
      },
      duration_ms: Date.now() - startedAt,
    });
    if (healthErr) throw new Error(`substrate_health_log: ${healthErr.message}`);

    log.info({ status, anchors: anchors.length }, 'substrate_health.anchor_check_recorded');

    // ── W4/SG-5 — webhook_delivery_twilio dead-letter check ─────────
    // Unprocessed Twilio deliveries older than one hour have outlived
    // Twilio's retry window. Each row still holds the full form
    // payload (replayable), but it needs an operator decision — RED.
    const dlCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: deadLetters, error: dlErr } = await supabase
      .from('webhook_idempotency')
      .select('key, route, first_seen_at')
      .eq('source', 'twilio')
      .is('processed_at', null)
      .lt('first_seen_at', dlCutoff)
      .limit(20);
    if (dlErr) throw new Error(`webhook_idempotency: ${dlErr.message}`);
    const dlRows = deadLetters ?? [];
    const dlStatus = dlRows.length > 0 ? 'RED' : 'GREEN';
    const { error: dlHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'webhook_delivery_twilio',
      status: dlStatus,
      detail: { dead_letters: dlRows, cutoff: dlCutoff },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (dlHealthErr) throw new Error(`substrate_health_log (twilio): ${dlHealthErr.message}`);
    if (dlStatus === 'RED') {
      log.error({ deadLetters: dlRows.map((d: { key: string }) => d.key) }, 'substrate_health.twilio_dead_letters');
    }

    // ── W5/SG-6 — webhook_delivery_stripe dead-letter check ─────────
    // Same contract as the Twilio check: an unprocessed stripe_event_log
    // row older than one hour means Stripe's retries exhausted against a
    // failing handler — the event is durable but needs an operator.
    const { data: stripeDl, error: sdlErr } = await supabase
      .from('stripe_event_log')
      .select('event_id, event_type, received_at')
      .is('processed_at', null)
      .lt('received_at', dlCutoff)
      .limit(20);
    if (sdlErr) throw new Error(`stripe_event_log: ${sdlErr.message}`);
    const stripeRows = stripeDl ?? [];
    const stripeStatus = stripeRows.length > 0 ? 'RED' : 'GREEN';
    const { error: sHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'webhook_delivery_stripe',
      status: stripeStatus,
      detail: { dead_letters: stripeRows, cutoff: dlCutoff },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (sHealthErr) throw new Error(`substrate_health_log (stripe): ${sHealthErr.message}`);

    // ── W5/SG-6 — cron_health: the alarm checks its own pulse ───────
    // verify-hashes (daily, 15 minutes before this run) must have
    // recorded a chain_integrity_shift_events outcome within 26 hours;
    // a stale or missing row means the chain alarm itself is not
    // running — RED regardless of what the chain would have said.
    const { data: lastChain, error: chErr } = await supabase
      .from('substrate_health_log')
      .select('run_at, status')
      .eq('check_name', 'chain_integrity_shift_events')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (chErr) throw new Error(`substrate_health_log (cron read): ${chErr.message}`);
    const chainRow = lastChain as { run_at: string; status: string } | null;
    const chainFresh =
      chainRow !== null && Date.parse(chainRow.run_at) > Date.now() - 26 * 60 * 60 * 1000;
    const cronStatus = chainFresh ? 'GREEN' : 'RED';
    const { error: cHealthErr } = await supabase.from('substrate_health_log').insert({
      check_name: 'cron_health',
      status: cronStatus,
      detail: {
        watched: 'chain_integrity_shift_events',
        last_run_at: chainRow?.run_at ?? null,
        last_status: chainRow?.status ?? null,
      },
      baseline: null,
      duration_ms: Date.now() - startedAt,
    });
    if (cHealthErr) throw new Error(`substrate_health_log (cron): ${cHealthErr.message}`);

    // ── W5/SG-6 — human ping on any non-GREEN (best-effort) ─────────
    const redLines: string[] = [];
    if (status !== 'GREEN') redLines.push(`anchor_fingerprint: ${status}`);
    if (dlStatus !== 'GREEN') redLines.push(`webhook_delivery_twilio: ${dlStatus} (${dlRows.length} dead letters)`);
    if (stripeStatus !== 'GREEN') redLines.push(`webhook_delivery_stripe: ${stripeStatus} (${stripeRows.length} dead letters)`);
    if (cronStatus !== 'GREEN') redLines.push(`cron_health: ${cronStatus} (chain alarm stale)`);
    if (redLines.length > 0) {
      redLines.push('Runbook: docs/incident-runbook.md');
      void postOpsAlert('FLOS-SHA-001 substrate health RED', redLines);
    }

    return NextResponse.json({
      ok: status === 'GREEN' && dlStatus === 'GREEN' && stripeStatus === 'GREEN' && cronStatus === 'GREEN',
      status,
      anchors_checked: anchors.length,
      mismatched: mismatched.map((a) => a.id),
      unverifiable: unverifiable.map((a) => a.id),
      webhook_delivery_twilio: dlStatus,
      dead_letters: dlRows.length,
      webhook_delivery_stripe: stripeStatus,
      stripe_dead_letters: stripeRows.length,
      cron_health: cronStatus,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // The anchor check is a primary tamper-evidence alarm; a silent
    // 500 would mean a RED never lands. Surface to Vercel ERROR logs.
    log.error({ err: message }, 'cron.substrate_health.failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
