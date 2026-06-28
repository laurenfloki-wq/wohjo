// POST /api/exposure/lead — lead capture (§2.1 step 4, slice c).
//
// Order of operations (acceptance §11): validate → RE-SCORE server-side (the
// client's score is never trusted) → PERSIST to Supabase FIRST → email the
// user's report + the founder hand-off → respond. Persistence happens before
// any notification, and the founder hand-off carries the contact details, so a
// lead is never lost even if a DB row or an email send fails (failures are
// dead-lettered). Public + unauthenticated: rate-limited, size-bounded, no PII
// in logs.

import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/security/rate-limit';
import { routeLogger } from '@/lib/logger';
import { LeadRequestSchema } from '@/lib/exposure/schema';
import { scoreExposure } from '@/lib/exposure/score';
import { exposureRepo } from '@/lib/db/repositories/exposure.repo';
import { sendExposureFounderHandoff, sendExposureUserReport } from '@/lib/email/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const lead = {
    name: data.name,
    work_email: data.work_email,
    company: data.company,
    role: data.role || null,
    phone: data.phone || null,
  };

  // ── Persist FIRST ─────────────────────────────────────────────────────────
  const repo = exposureRepo();
  let submissionId: string | null = null;
  try {
    const sub = await repo.createSubmission({
      ruleset_version: result.version,
      answers: data.answers,
      scores: {
        overall: result.overall,
        biggestGap: result.biggestGap,
        vectors: result.vectors,
      },
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
    if (leadRow.error) {
      // Submission saved but the lead row failed. Do NOT lose the lead — the
      // founder hand-off below still delivers the contact details by email.
      log.error({ dbError: leadRow.error.message, submissionId }, 'exposure.lead.lead_insert_failed');
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
    await sendExposureUserReport({ to: data.work_email, firstName: data.name.split(' ')[0], result });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, 'exposure.lead.user_email_failed');
  }

  log.info(
    { submissionId, overall: result.overall, biggestGap: result.biggestGap ?? 'none' },
    'exposure.lead.captured',
  );
  return NextResponse.json({ success: true });
}
