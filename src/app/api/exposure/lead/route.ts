// POST /api/exposure/lead — lead capture (§2.1 step 4; slices c, d + S1).
//
// Order of operations (acceptance §11): validate (+ honeypot/timing bot checks)
// → RE-SCORE server-side (the client's score is never trusted) → PERSIST to
// Supabase FIRST → respond. Everything else — the PDF, the user's report email,
// the founder hand-off, and the HubSpot/Apollo sync — runs AFTER the response
// via after(), so the user never waits on a render or a send (§5, P3).
//
// The lead is captured before the response, and the founder hand-off (which
// carries the contact details) runs post-response regardless of whether the
// lead ROW succeeded, so a lead is never lost. Sends are dead-lettered/logged
// on failure. Public + unauthenticated: durable (shared-store) rate limit,
// honeypot + min-submit-time, size/identity-bounded answers, no PII in logs.

import { NextResponse, after } from 'next/server';
import { checkRateLimitDurable } from '@/lib/security/rate-limit-durable';
import { getClientIP } from '@/lib/security/rate-limit';
import { logger, routeLogger } from '@/lib/logger';
import { LeadRequestSchema, MIN_SUBMIT_MS } from '@/lib/exposure/schema';
import { scoreExposure } from '@/lib/exposure/score';
import type { Answers, ExposureResult } from '@/lib/exposure/types';
import { exposureRepo } from '@/lib/db/repositories/exposure.repo';
import { sendExposureFounderHandoff, sendExposureUserReport } from '@/lib/email/notify';
import { renderExposureReportPdf } from '@/lib/exposure/report-pdf';
import { enrichCompany } from '@/lib/exposure/apollo';
import { syncExposureLeadToHubSpot, type HubSpotLead } from '@/lib/exposure/hubspot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * All post-response work: founder hand-off, the user's report (with PDF), then
 * Apollo enrichment + HubSpot sync + status. Exported for testing. Never throws
 * — every step is independently tolerant; this runs detached from the request.
 */
export async function runExposureFollowups(params: {
  lead: HubSpotLead;
  result: ExposureResult;
  submissionId: string | null;
  leadId: string | null;
}): Promise<void> {
  const { lead, result, submissionId, leadId } = params;

  // 1. Founder hand-off — carries the contact details, so the lead is delivered
  //    even if the lead ROW failed to insert.
  try {
    await sendExposureFounderHandoff({ lead, result, submissionId });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.founder_email_failed');
  }

  // 2. User report (with PDF) — off the request path.
  try {
    const pdf = await renderExposureReportPdf(result).catch(() => undefined);
    await sendExposureUserReport({
      to: lead.work_email,
      firstName: lead.name.split(' ')[0],
      result,
      ...(pdf ? { pdf } : {}),
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.user_email_failed');
  }

  // 3. CRM + enrichment (best-effort).
  const enrichment = await enrichCompany(lead.work_email).catch(() => null);
  const status = await syncExposureLeadToHubSpot({
    lead,
    result,
    enrichment,
    timestampIso: new Date().toISOString(),
  });
  if (leadId) {
    try {
      await exposureRepo().updateLeadHubspotStatus(leadId, status);
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'exposure.lead.hubspot_status_update_failed',
      );
    }
  }
  logger.info({ hubspot: status, enriched: Boolean(enrichment) }, 'exposure.lead.followups.done');
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/exposure/lead', request.headers.get('x-request-id'));

  // Durable (shared-store) rate limit — holds across serverless instances.
  const ip = getClientIP(request);
  const rl = await checkRateLimitDurable(`exposure-lead:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    log.warn({ ip }, 'exposure.lead.rate_limit.exceeded');
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again in an hour.' }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = LeadRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Bot checks (no PII logged). Filled honeypot or implausibly fast submit.
  if (data.hp.trim().length > 0) {
    log.warn({ ip }, 'exposure.lead.bot.honeypot');
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 });
  }
  if (typeof data.elapsed_ms === 'number' && data.elapsed_ms < MIN_SUBMIT_MS) {
    log.warn({ ip, elapsedMs: data.elapsed_ms }, 'exposure.lead.bot.too_fast');
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 });
  }

  // Authoritative server-side score — never trust the client's numbers.
  const result = scoreExposure(data.answers as Answers);
  const lead: HubSpotLead = {
    name: data.name,
    work_email: data.work_email,
    company: data.company,
    role: data.role || null,
    phone: data.phone || null,
    source: data.source || null,
  };

  // ── Persist FIRST ───────────────────────────────────────────────────────────
  const repo = exposureRepo();
  let submissionId: string | null = null;
  let leadId: string | null = null;
  try {
    const sub = await repo.createSubmission({
      ruleset_version: result.version,
      answers: data.answers,
      scores: { overall: result.overall, biggestGap: result.biggestGap, vectors: result.vectors },
      states: result.states,
      worker_band: result.workerBand,
      overall: result.overall,
      biggest_gap: result.biggestGap,
      source: data.source || null,
      utm: data.utm ?? null,
      session_id: data.session_id || null,
    });
    if (sub.error || !sub.data) {
      log.error({ dbError: sub.error?.message }, 'exposure.lead.submission_insert_failed');
      return NextResponse.json({ error: 'Could not save your result. Please try again.' }, { status: 502 });
    }
    submissionId = sub.data.id as string;

    const leadRow = await repo.createLead({ submission_id: submissionId, ...lead, consent: data.consent });
    if (leadRow.error || !leadRow.data) {
      // Submission saved but the lead row failed. The lead is NOT lost — the
      // founder hand-off in runExposureFollowups still delivers the details.
      log.error({ dbError: leadRow.error?.message, submissionId }, 'exposure.lead.lead_insert_failed');
    } else {
      leadId = leadRow.data.id as string;
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.persist_threw');
    return NextResponse.json({ error: 'Could not save your result. Please try again.' }, { status: 502 });
  }

  // ── Everything else AFTER the response (user never waits on it) ──────────────
  after(() => runExposureFollowups({ lead, result, submissionId, leadId }));

  log.info(
    { submissionId, overall: result.overall, biggestGap: result.biggestGap ?? 'none' },
    'exposure.lead.captured',
  );
  return NextResponse.json({ success: true });
}
