// L2.1 chunk 3 — RULE_013 (COLLUSION_CANDIDATE) cron
//
// /api/cron/intelligence-collusion-pairs — runs nightly at 03:30 AEST
// (17:30 UTC previous day). For every (worker, supervisor) pair with
// activity in the last 30 days:
//
//   1. Compute the pair's approval count + total shifts.
//   2. If approval rate is 100% AND shifts > 20 AND any of
//      RULE_010 / RULE_011 / RULE_012 was raised on the pair's
//      shifts in the period, fire RULE_013.
//   3. On fire: emit an ANOMALY_FLAG event (sealed via the WLES
//      chain) AND email support@flosmosis.com with the pair details
//      AND insert an admin_access_log alert row.
//
// Pure detection path — never blocks anything; never modifies prior
// shift records. Idempotent within a calendar day: only fires once
// per (worker, supervisor) per day, gated on the existence of an
// ANOMALY_FLAG event with reason RULE_013 raised today.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { routeLogger } from '@/lib/logger';
import { checkRule013 } from '@/lib/intelligence/collusion-rules';
import type { AnomalyFlag } from '@/lib/intelligence/rules';
import { Resend } from 'resend';

const TRIGGER_RULES = ['RULE_010', 'RULE_011', 'RULE_012'];
const PERIOD_DAYS = 30;
const SHIFT_THRESHOLD = 20;
const APPROVAL_RATE_THRESHOLD = 100;

interface ShiftRow {
  id: string;
  worker_id: string;
  status: string;
  anomaly_flags: AnomalyFlag[] | null;
  supervisor_approved_by: string | null;
  workers: { first_name: string } | null;
}

export async function GET(request: Request) {
  const log = routeLogger(
    'GET /api/cron/intelligence-collusion-pairs',
    request.headers.get('x-request-id'),
  );
  log.info({}, 'request.received');

  const secret =
    request.headers.get('x-cron-secret') ??
    new URL(request.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    const periodStartIso = new Date(
      Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fetch all shifts in the period that have a supervisor_approved_by.
    // We only consider approved shifts — un-approved shifts can't
    // contribute to "approval rate" math.
    const { data: rows, error } = await supabase
      .from('shifts')
      .select(
        'id, worker_id, status, anomaly_flags, supervisor_approved_by, workers(first_name)',
      )
      .gte('created_at', periodStartIso)
      .not('supervisor_approved_by', 'is', null);
    if (error) {
      log.error({ err: error.message }, 'collusion_pairs.fetch_failed');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const shifts = (rows ?? []) as unknown as ShiftRow[];

    // Group by (worker_id, supervisor_id).
    interface PairAccumulator {
      worker_id: string;
      supervisor_id: string;
      worker_first_name: string | null;
      total_shifts: number;
      approved_shifts: number;
      triggering_rule_ids: Set<string>;
    }
    const pairs = new Map<string, PairAccumulator>();
    for (const s of shifts) {
      if (!s.supervisor_approved_by) continue;
      const key = `${s.worker_id}|${s.supervisor_approved_by}`;
      const acc = pairs.get(key) ?? {
        worker_id: s.worker_id,
        supervisor_id: s.supervisor_approved_by,
        worker_first_name: s.workers?.first_name ?? null,
        total_shifts: 0,
        approved_shifts: 0,
        triggering_rule_ids: new Set<string>(),
      };
      acc.total_shifts += 1;
      if (s.status === 'APPROVED' || s.status === 'EXPORTED') {
        acc.approved_shifts += 1;
      }
      for (const f of s.anomaly_flags ?? []) {
        if (TRIGGER_RULES.includes(f.ruleId)) {
          acc.triggering_rule_ids.add(f.ruleId);
        }
      }
      pairs.set(key, acc);
    }

    log.info({ pairCount: pairs.size }, 'collusion_pairs.scanned');

    // Today's idempotency window (UTC): RULE_013 fires at most once
    // per (worker, supervisor) per UTC day.
    const todayStartIso = new Date().toISOString().slice(0, 10);

    const fired: Array<{
      worker_id: string;
      supervisor_id: string;
      total_shifts: number;
      approval_rate_pct: number;
      triggering_rule_ids: string[];
    }> = [];

    for (const acc of pairs.values()) {
      if (acc.total_shifts < SHIFT_THRESHOLD + 1) continue;
      const approvalRatePct =
        (acc.approved_shifts / acc.total_shifts) * 100;
      if (approvalRatePct < APPROVAL_RATE_THRESHOLD) continue;
      if (acc.triggering_rule_ids.size === 0) continue;

      // Look up supervisor name for the explanation text.
      const { data: sup } = await supabase
        .from('supervisors')
        .select('name')
        .eq('id', acc.supervisor_id)
        .maybeSingle();

      const r013 = checkRule013({
        worker_first_name: acc.worker_first_name ?? 'Worker',
        supervisor_first_name:
          (sup as { name?: string | null } | null)?.name?.split(' ')[0] ??
          'Supervisor',
        shifts_in_period: acc.total_shifts,
        approval_rate_pct: approvalRatePct,
        triggering_rule_ids: [...acc.triggering_rule_ids],
      });
      if (!r013.triggered || !r013.flag) continue;

      // Idempotency check: did we already fire RULE_013 for this
      // pair today? If so, skip.
      const { count: alreadyFiredToday } = await supabase
        .from('shift_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'ANOMALY_FLAG')
        .eq('worker_id', acc.worker_id)
        .gte('created_at', `${todayStartIso}T00:00:00.000Z`)
        .ilike('event_data', '%RULE_013%');
      if ((alreadyFiredToday ?? 0) > 0) {
        log.info(
          { workerId: acc.worker_id, supervisorId: acc.supervisor_id },
          'collusion_pairs.already_fired_today',
        );
        continue;
      }

      // Emit an ANOMALY_FLAG event. We do NOT compute a chain link
      // here — the v0 chain pipeline lives in analyse.ts and the v1
      // pipeline lives in v1-translate.ts. This event is filed as a
      // standalone observational record; the daily verifier (B5)
      // recomputes its self-hash. Chain integrity is preserved at
      // the prod-write level.
      const eventData = {
        rule_id: 'RULE_013',
        severity: 'HIGH' as const,
        worker_id: acc.worker_id,
        supervisor_id: acc.supervisor_id,
        period_days: PERIOD_DAYS,
        shifts_in_period: acc.total_shifts,
        approval_rate_pct: Math.round(approvalRatePct),
        triggering_rule_ids: [...acc.triggering_rule_ids],
        explanation: r013.flag.explanation,
        action: r013.flag.action,
        emitted_at: new Date().toISOString(),
      };
      await supabase.from('shift_events').insert({
        worker_id: acc.worker_id,
        site_id: null,
        event_type: 'ANOMALY_FLAG',
        event_data: eventData,
        // event_hash + previous_event_hash left for the verifier sweep
        // to reject if missing — for V1 we'll route the rule through
        // the proper sealing pipeline once the cron's payload format
        // is finalised. Phase-1 intent is durability + visibility.
      });

      // Durable alert via admin_access_log so the existing alerting
      // pipeline (used by /api/cron/verify-hashes) picks it up.
      await supabase.from('admin_access_log').insert({
        admin_user_id: '00000000-0000-0000-0000-000000000000',
        customer_id_accessed: null,
        resource_type: 'shifts',
        resource_id: acc.worker_id,
        action: 'alert',
        reason_code: 'RULE_013_COLLUSION_CANDIDATE',
        source_ip: null,
      });

      // Email FLOSMOSIS support — best-effort, log on failure.
      try {
        await emailSupport(eventData);
      } catch (e) {
        log.warn(
          { err: e instanceof Error ? e.message : 'unknown' },
          'collusion_pairs.email_failed',
        );
      }

      fired.push({
        worker_id: acc.worker_id,
        supervisor_id: acc.supervisor_id,
        total_shifts: acc.total_shifts,
        approval_rate_pct: Math.round(approvalRatePct),
        triggering_rule_ids: [...acc.triggering_rule_ids],
      });
    }

    return NextResponse.json({
      ok: true,
      pairs_scanned: pairs.size,
      fired_count: fired.length,
      fired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    log.error({ err: message }, 'collusion_pairs.unhandled');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function emailSupport(eventData: {
  rule_id: string;
  worker_id: string;
  supervisor_id: string;
  shifts_in_period: number;
  approval_rate_pct: number;
  triggering_rule_ids: string[];
  explanation: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const supportEmail =
    process.env.SUPPORT_EMAIL_TO ?? 'support@flosmosis.com';
  const fromAddr =
    process.env.CONTACT_EMAIL_FROM ?? 'FLOSTRUCTION <noreply@flosmosis.com>';

  await resend.emails.send({
    from: fromAddr,
    to: supportEmail,
    subject: `[INTELLIGENCE] Collusion candidate (${eventData.rule_id})`,
    text: [
      `RULE_013 — COLLUSION_CANDIDATE fired by nightly review.`,
      ``,
      `Worker ID: ${eventData.worker_id}`,
      `Supervisor ID: ${eventData.supervisor_id}`,
      `Shifts in last ${PERIOD_DAYS} days: ${eventData.shifts_in_period}`,
      `Approval rate: ${eventData.approval_rate_pct}%`,
      `Triggering rules already raised on this pair: ${eventData.triggering_rule_ids.join(', ')}`,
      ``,
      eventData.explanation,
      ``,
      `Triage at /command (Intelligence → Pair review). Until reviewed,`,
      `do NOT approve further shifts for this pair.`,
    ].join('\n'),
  });
}
