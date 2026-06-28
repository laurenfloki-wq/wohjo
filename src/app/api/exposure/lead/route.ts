// POST /api/exposure/lead — lead capture (§2.1 step 4, slices c + d).
//
// Order of operations (acceptance §11): validate → RE-SCORE server-side (the
// client's score is never trusted) → PERSIST to Supabase FIRST → email the
// user's report (with PDF) + the founder hand-off → respond. The CRM/enrichment
// integrations (HubSpot, Apollo) run AFTER the response via after(), so the
// user never waits on them (§5). Persistence happens before any notification,
// and the founder hand-off carries the contact details, so a lead is never lost
// even if a DB row or a send fails (failures are dead-lettered/logged). Public +
// unauthenticated: rate-limited, size-bounded, no PII in logs.

import { NextResponse, after } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { logger, routeLogger } from '@/lib/logger';
import { LeadRequestSchema } from '@/lib/exposure/schema';
import { scoreExposure } from '@/lib/exposure/score';
import type { ExposureResult } from '@/lib/exposure/types';
import { exposureRepo } from '@/lib/db/repositories/exposure.repo';
import { sendExposureFounderHandoff, sendExposureUserReport } from '@/lib/email/notify';
import { renderExposureReportPdf } from '@/lib/exposure/report-pdf';
import { enrichCompany } from '@/lib/exposure/apollo';
import { syncExposureLeadToHubSpot, type HubSpotLead } from '@/lib/exposure/hubspot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Post-response CRM work: enrich the company (Apollo, best-effort) and sync the
 * lead to HubSpot, then record the sync status. Exported for testing. Never
 * throws — every step is tolerant; this runs detached from the user's request.
 */
export async function runExposureCrmFollowups(params: {
  lead: HubSpotLead;
  result: ExposureResult;
  leadId: string | null;
}): Promise<void> {
  const enrichment = await enrichCompany(params.lead.work_email).catch(() => null);
  const status = await syncExposureLeadToHubSpot({
    lead: params.lead,
    result: params.result,
    enrichment,
    timestampIso: new Date().toISOString(),
  });
  if (params.leadId) {
    try {
      await exposureRepo().updateLeadHubspotStatus(params.leadId, status);
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'exposure.lead.hubspot_status_update_failed',
      );
    }
  }
  logger.info({ hubspot: status, enriched: Boolean(enrichment) }, 'exposure.lead.crm_followups.done');
}

export async function POST(request: Request) {
  const log = routeLogger('POST /api/exposure/lead', request.headers.get('x-request-id'));

  const ip = getClientIP(request);
  const rl = checkRateLimit(`exposure-lead:${ip}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
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

  // Authoritative server-side score — never trust the client's numbers.
  const result = scoreExposure(data.answers);
  const lead: HubSpotLead = {
    name: data.name,
    work_email: data.work_email,
    company: data.company,
    role: data.role || null,
    phone: data.phone || null,
    source: data.source || null,
  };

  // ── Persist FIRST ─────────────────────────────────────────────────────────
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
      // Submission saved but the lead row failed. Do NOT lose the lead — the
      // founder hand-off below still delivers the contact details by email.
      log.error({ dbError: leadRow.error?.message, submissionId }, 'exposure.lead.lead_insert_failed');
    } else {
      leadId = leadRow.data.id as string;
    }
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.persist_threw');
    return NextResponse.json({ error: 'Could not save your result. Please try again.' }, { status: 502 });
  }

  // ── Notify (tolerant — the lead is already captured) ───────────────────────
  try {
    await sendExposureFounderHandoff({ lead, result, submissionId });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.founder_email_failed');
  }
  try {
    const pdf = await renderExposureReportPdf(result).catch(() => undefined);
    await sendExposureUserReport({
      to: data.work_email,
      firstName: data.name.split(' ')[0],
      result,
      ...(pdf ? { pdf } : {}),
    });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.user_email_failed');
  }

  // ── CRM + enrichment AFTER the response (user never waits on these) ─────────
  after(() => runExposureCrmFollowups({ lead, result, leadId }));

  log.info(
    { submissionId, overall: result.overall, biggestGap: result.biggestGap ?? 'none' },
    'exposure.lead.captured',
  );
  return NextResponse.json({ success: true });
}
