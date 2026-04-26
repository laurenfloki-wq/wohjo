// L2.1 chunk 2 — Worker sign-in anomaly detection
//
// Called from /api/field/bootstrap-worker AFTER the sign-in has
// succeeded at Supabase. Pure observation layer — does not gate
// auth. Three flags can be raised:
//
//   NEW_DEVICE_SIGN_IN          fingerprint never seen for this worker
//   IMPOSSIBLE_TRAVEL_SIGN_IN   country changed within 2 hours
//   OFF_HOURS_SIGN_IN           hour-of-day >4h from 30-day modal hour
//
// Side effects:
//   - Insert a worker_sign_in_log row with the computed flags.
//   - Upsert worker_device_fingerprints (touch last_seen_at, set
//     first_seen_at + ip_country + device_label on first observation).
//   - If any flag was raised, fire-and-forget an email to the
//     worker's primary-site supervisor via the Resend notify path.
//
// Failure modes are LOG-ONLY — the anomaly observer must NEVER
// cause bootstrap-worker to fail. Auth already succeeded; if the
// observation infra is broken we still let the worker work.

import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWorkerSignInAnomalyEmail } from '@/lib/email/notify';

export type SignInFlag =
  | 'NEW_DEVICE_SIGN_IN'
  | 'IMPOSSIBLE_TRAVEL_SIGN_IN'
  | 'OFF_HOURS_SIGN_IN';

const IMPOSSIBLE_TRAVEL_WINDOW_MS = 2 * 60 * 60 * 1000;
const OFF_HOURS_DELTA_HOURS = 4;
const MODAL_HOUR_LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_OFF_HOURS = 10; // need a stable mode before flagging

export interface SignInContext {
  workerId: string;
  workerFirstName?: string | null;
  companyId: string | null;
  // Vercel headers populate these in production; in dev they may be
  // absent and the helper handles that gracefully.
  userAgent: string | null;
  acceptLanguage: string | null;
  // Vercel "edge" location headers
  ipAddress: string | null;
  ipCountry: string | null;
  ipCity: string | null;
  ipLat: number | null;
  ipLng: number | null;
  // Supplied by the caller — UTC timestamp of the sign-in event.
  signedInAt: Date;
}

/**
 * Compute the device fingerprint. Inputs that survive a normal
 * worker session (UA family + accept-language + a stable user-side
 * salt) are mixed via SHA-256. The fingerprint is intentionally NOT
 * derived from the IP — workers move between coverage and wifi all
 * day.
 */
function computeFingerprint(ctx: SignInContext): string {
  const parts = [
    ctx.userAgent ?? '',
    ctx.acceptLanguage ?? '',
    ctx.workerId, // ensures fingerprints are per-worker, not global
  ].join('|');
  return createHash('sha256').update(parts, 'utf8').digest('hex');
}

/**
 * Build a short worker-readable label for the device, used in the
 * supervisor notification copy. "Android phone from Sydney" reads
 * better than a 64-char hex string.
 */
function deriveDeviceLabel(ctx: SignInContext): string {
  const ua = (ctx.userAgent ?? '').toLowerCase();
  const platform =
    /android/.test(ua)
      ? 'Android phone'
      : /iphone|ios/.test(ua)
        ? 'iPhone'
        : /ipad/.test(ua)
          ? 'iPad'
          : /mac os|macintosh/.test(ua)
            ? 'Mac'
            : /windows/.test(ua)
              ? 'Windows PC'
              : 'a device';
  return ctx.ipCity
    ? `${platform} from ${ctx.ipCity}`
    : ctx.ipCountry
      ? `${platform} from ${ctx.ipCountry}`
      : platform;
}

/**
 * Pure-function flag evaluator. Inputs:
 *   - This sign-in's context.
 *   - Whether the fingerprint was previously known (from the upsert
 *     check the caller does).
 *   - The most recent prior sign-in for the worker (or null if none).
 *   - The 30-day modal hour-of-day for the worker, plus the sample
 *     count (for the "need >=10 samples" guard).
 *
 * Extracted from the side-effect path so the unit tests can exercise
 * it without standing up Supabase.
 */
export function evaluateFlags(input: {
  ctx: SignInContext;
  fingerprintWasKnown: boolean;
  priorSignIn: { signedInAt: Date; ipCountry: string | null } | null;
  modalHour: number | null;
  modalSamples: number;
}): SignInFlag[] {
  const flags: SignInFlag[] = [];
  if (!input.fingerprintWasKnown) {
    flags.push('NEW_DEVICE_SIGN_IN');
  }
  if (
    input.priorSignIn &&
    input.priorSignIn.ipCountry &&
    input.ctx.ipCountry &&
    input.priorSignIn.ipCountry !== input.ctx.ipCountry &&
    input.ctx.signedInAt.getTime() - input.priorSignIn.signedInAt.getTime() <=
      IMPOSSIBLE_TRAVEL_WINDOW_MS
  ) {
    flags.push('IMPOSSIBLE_TRAVEL_SIGN_IN');
  }
  if (
    input.modalHour !== null &&
    input.modalSamples >= MIN_SAMPLES_FOR_OFF_HOURS
  ) {
    const currentHour = input.ctx.signedInAt.getUTCHours();
    const delta = Math.min(
      Math.abs(currentHour - input.modalHour),
      24 - Math.abs(currentHour - input.modalHour),
    );
    if (delta > OFF_HOURS_DELTA_HOURS) {
      flags.push('OFF_HOURS_SIGN_IN');
    }
  }
  return flags;
}

/**
 * The integration entry point. Logs failures but never throws —
 * sign-in observation must not gate bootstrap.
 */
export async function observeWorkerSignIn(
  log: Logger,
  ctx: SignInContext,
): Promise<{ flags: SignInFlag[] } | null> {
  try {
    const supabase = createServiceClient();
    const fingerprint = computeFingerprint(ctx);

    // (1) Was this fingerprint already known for this worker?
    const { data: existingFp } = await supabase
      .from('worker_device_fingerprints')
      .select('worker_id')
      .eq('worker_id', ctx.workerId)
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    const fingerprintWasKnown = !!existingFp;

    // (2) Most recent prior sign-in.
    const { data: priorRows } = await supabase
      .from('worker_sign_in_log')
      .select('signed_in_at, ip_country')
      .eq('worker_id', ctx.workerId)
      .order('signed_in_at', { ascending: false })
      .limit(1);
    const priorSignIn =
      priorRows && priorRows.length > 0
        ? {
            signedInAt: new Date(priorRows[0].signed_in_at as string),
            ipCountry: (priorRows[0] as { ip_country: string | null }).ip_country ?? null,
          }
        : null;

    // (3) 30-day modal sign-in hour-of-day.
    const lookbackStart = new Date(
      ctx.signedInAt.getTime() - MODAL_HOUR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const { data: recentRows } = await supabase
      .from('worker_sign_in_log')
      .select('signed_in_at')
      .eq('worker_id', ctx.workerId)
      .gte('signed_in_at', lookbackStart.toISOString())
      .order('signed_in_at', { ascending: false })
      .limit(500);

    let modalHour: number | null = null;
    let modalSamples = 0;
    if (recentRows && recentRows.length > 0) {
      const histogram = new Array<number>(24).fill(0);
      for (const r of recentRows) {
        const d = new Date((r as { signed_in_at: string }).signed_in_at);
        histogram[d.getUTCHours()]++;
      }
      let bestIdx = 0;
      let bestCount = 0;
      for (let i = 0; i < 24; i++) {
        if (histogram[i] > bestCount) {
          bestCount = histogram[i];
          bestIdx = i;
        }
      }
      modalHour = bestIdx;
      modalSamples = recentRows.length;
    }

    const flags = evaluateFlags({
      ctx,
      fingerprintWasKnown,
      priorSignIn,
      modalHour,
      modalSamples,
    });

    // (4) Insert log row.
    const { error: logErr } = await supabase.from('worker_sign_in_log').insert({
      worker_id: ctx.workerId,
      signed_in_at: ctx.signedInAt.toISOString(),
      fingerprint,
      ip_address: ctx.ipAddress,
      ip_country: ctx.ipCountry,
      ip_city: ctx.ipCity,
      ip_lat: ctx.ipLat,
      ip_lng: ctx.ipLng,
      flags,
      user_agent: ctx.userAgent ? ctx.userAgent.slice(0, 256) : null,
    });
    if (logErr) {
      log.warn(
        { err: logErr.message, workerId: ctx.workerId },
        'signin_anomaly.log_insert_failed',
      );
    }

    // (5) Upsert fingerprint observation.
    if (fingerprintWasKnown) {
      await supabase
        .from('worker_device_fingerprints')
        .update({ last_seen_at: ctx.signedInAt.toISOString() })
        .eq('worker_id', ctx.workerId)
        .eq('fingerprint', fingerprint);
    } else {
      await supabase.from('worker_device_fingerprints').insert({
        worker_id: ctx.workerId,
        fingerprint,
        first_seen_at: ctx.signedInAt.toISOString(),
        last_seen_at: ctx.signedInAt.toISOString(),
        ip_country: ctx.ipCountry,
        device_label: deriveDeviceLabel(ctx),
      });
    }

    // (6) If anything flagged, notify the supervisor.
    if (flags.length > 0 && ctx.companyId) {
      // Fire-and-forget; log on failure but don't bubble.
      try {
        await fireSupervisorEmail(log, ctx, flags, deriveDeviceLabel(ctx));
      } catch (e) {
        log.warn(
          { err: e instanceof Error ? e.message : 'unknown', workerId: ctx.workerId },
          'signin_anomaly.supervisor_email_failed',
        );
      }
    }

    log.info(
      { workerId: ctx.workerId, flags, fingerprintWasKnown },
      'signin_anomaly.observed',
    );

    return { flags };
  } catch (e) {
    // Catch-all — observation must not gate bootstrap.
    log.warn(
      { err: e instanceof Error ? e.message : 'unknown', workerId: ctx.workerId },
      'signin_anomaly.observe_failed',
    );
    return null;
  }
}

async function fireSupervisorEmail(
  log: Logger,
  ctx: SignInContext,
  flags: SignInFlag[],
  deviceLabel: string,
): Promise<void> {
  if (!ctx.companyId) return;
  const supabase = createServiceClient();

  // Find the worker's primary site supervisor's email.
  // workers.primary_site_id → sites.supervisor_id → admins (by user_id) → email.
  // Fall back to the company's primary admin if no site supervisor.
  const { data: worker } = await supabase
    .from('workers')
    .select('primary_site_id, first_name')
    .eq('id', ctx.workerId)
    .maybeSingle();

  let supervisorEmail: string | null = null;
  let supervisorName: string | null = null;

  if (worker?.primary_site_id) {
    const { data: site } = await supabase
      .from('sites')
      .select('supervisor_id')
      .eq('id', worker.primary_site_id)
      .maybeSingle();
    if (site?.supervisor_id) {
      const { data: admin } = await supabase
        .from('admins')
        .select('email, name')
        .eq('user_id', site.supervisor_id)
        .maybeSingle();
      supervisorEmail = (admin as { email?: string | null } | null)?.email ?? null;
      supervisorName = (admin as { name?: string | null } | null)?.name ?? null;
    }
  }

  if (!supervisorEmail) {
    // Fallback: company primary admin.
    const { data: anyAdmin } = await supabase
      .from('admins')
      .select('email, name')
      .eq('company_id', ctx.companyId)
      .limit(1)
      .maybeSingle();
    supervisorEmail = (anyAdmin as { email?: string | null } | null)?.email ?? null;
    supervisorName = (anyAdmin as { name?: string | null } | null)?.name ?? null;
  }

  if (!supervisorEmail) {
    log.info({ workerId: ctx.workerId }, 'signin_anomaly.no_supervisor_email');
    return;
  }

  await sendWorkerSignInAnomalyEmail({
    to: supervisorEmail,
    supervisorFirstName: supervisorName ?? null,
    workerFirstName: (worker as { first_name?: string | null } | null)?.first_name ?? ctx.workerFirstName ?? null,
    deviceLabel,
    flags,
    signedInAt: ctx.signedInAt.toISOString(),
    ipCountry: ctx.ipCountry,
  });
}
