// Flostruction — Email Notifications via Resend
// Used for payroll admin notifications after supervisor approvals.

import { Resend } from 'resend';
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';

let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is required');
    _resend = new Resend(apiKey);
  }
  return _resend;
}

// B4 / SG-5 (2026-06-12): every Resend send goes through this wrapper.
// The Resend SDK reports API failures via a returned { error } rather
// than throwing, so pre-B4 those failures were invisible even to
// callers that try/caught. Semantics preserved exactly: a thrown
// (network-level) error is recorded then rethrown; a returned API
// { error } is recorded then swallowed (as before) — visibility comes
// from the dead-letter row + the 'notification_outbound' health check,
// not from a control-flow change.
async function sendOrRecord(
  resend: Resend,
  payload: { from: string; to: string; subject: string; text: string },
  kind: string,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const result = (await resend.emails.send(payload)) as
      | { error?: { message?: string } | null }
      | null;
    if (result?.error) {
      await recordNotificationDeadLetter({
        channel: 'resend_email',
        recipient: payload.to,
        summary: { kind, subject: payload.subject },
        error: result.error.message ?? 'resend returned error',
        context,
      });
    }
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'resend_email',
      recipient: payload.to,
      summary: { kind, subject: payload.subject },
      error: err instanceof Error ? err.message : String(err),
      context,
    });
    throw err;
  }
}

interface ShiftSummary {
  workerName: string;
  site: string;
  hours: number;
  date: string;
}

/**
 * Notify payroll admin that a supervisor approved shifts via SMS or Flostruction Verify.
 */
export async function notifyPayrollAdmin(params: {
  to: string;
  supervisorName: string;
  method: 'SMS' | 'WOHJO_VERIFY' | 'PAYROLL_ADMIN';
  shifts: ShiftSummary[];
  isUrgent?: boolean;
}): Promise<void> {
  const resend = getResend();
  const shiftList = params.shifts
    .map((s) => `• ${s.workerName} — ${s.hours}hrs at ${s.site} (${s.date})`)
    .join('\n');

  const methodLabel = params.method === 'SMS' ? 'via SMS' : 'via Flostruction Verify';
  const subject = params.isUrgent
    ? `URGENT — Flostruction: ${params.supervisorName} flagged shift(s) ${methodLabel}`
    : `Flostruction: ${params.supervisorName} approved ${params.shifts.length} shift(s) ${methodLabel}`;

  await sendOrRecord(resend, {
    from: 'FLOSTRUCTION <noreply@flosmosis.com>',
    to: params.to,
    subject,
    text: `${subject}\n\n${shiftList}\n\nView details in Flostruction Command.`,
  }, 'payroll_admin_approval');
}

/**
 * Notify payroll admin that a shift has been disputed.
 */
export async function notifyPayrollDispute(params: {
  to: string;
  supervisorName: string;
  workerName: string;
  site: string;
  hours: number;
  method: 'SMS' | 'WOHJO_VERIFY';
  reason?: string;
}): Promise<void> {
  const resend = getResend();
  const methodLabel = params.method === 'SMS' ? 'via SMS' : 'via Flostruction Verify';

  await sendOrRecord(resend, {
    from: 'FLOSTRUCTION <noreply@flosmosis.com>',
    to: params.to,
    subject: `URGENT — Flostruction: ${params.supervisorName} flagged ${params.workerName}'s shift ${methodLabel}`,
    text: [
      `${params.supervisorName} has flagged a shift for review ${methodLabel}.`,
      '',
      `Worker: ${params.workerName}`,
      `Site: ${params.site}`,
      `Hours: ${params.hours}`,
      params.reason ? `Reason: ${params.reason}` : '',
      '',
      'This shift requires payroll review in Flostruction Command.',
    ]
      .filter(Boolean)
      .join('\n'),
  }, 'payroll_dispute');
}

/**
 * Chain integrity alert — dispatched by /api/cron/verify-hashes when a
 * WLES hash-chain mismatch is detected. Goes to the platform operator
 * (Lauren), not to a customer, because this is a platform-integrity
 * event, not a customer workflow event.
 *
 * Recipient resolution:
 *   1. params.to if provided
 *   2. process.env.ALERT_EMAIL_TO
 *   3. hardcoded fallback lauren.flosmosis@gmail.com
 *
 * On any send failure this function throws — the cron route is
 * expected to log and continue. Missing RESEND_API_KEY also throws.
 */
export interface ChainMismatchLine {
  company_id: string | null;
  event_id: string;
  event_type: string;
  reason: string;
  expected: string;
  actual: string;
  created_at: string;
}

export async function notifyChainIntegrityAlert(params: {
  to?: string;
  companiesScanned: number;
  eventsScanned: number;
  mismatches: ChainMismatchLine[];
  scanStartedAt: string;
  scanFinishedAt: string;
}): Promise<void> {
  const resend = getResend();
  const recipient =
    params.to ??
    process.env.ALERT_EMAIL_TO ??
    'lauren.flosmosis@gmail.com';

  const subject =
    params.mismatches.length === 1
      ? 'URGENT — Flostruction: WLES hash chain mismatch detected (1 event)'
      : `URGENT — Flostruction: WLES hash chain mismatch detected (${params.mismatches.length} events)`;

  const body = [
    'The daily hash-chain verification job detected a WLES integrity break.',
    '',
    `Scan window:      ${params.scanStartedAt} → ${params.scanFinishedAt}`,
    `Companies scanned: ${params.companiesScanned}`,
    `Events scanned:    ${params.eventsScanned}`,
    `Mismatches:        ${params.mismatches.length}`,
    '',
    'First 20 mismatches:',
    ...params.mismatches.slice(0, 20).map(
      (m) =>
        `  • company=${m.company_id ?? 'NULL'} event=${m.event_id} type=${m.event_type} reason=${m.reason}\n    expected=${m.expected}\n    actual=  ${m.actual}`,
    ),
    '',
    'An alert row has also been written to admin_access_log',
    '(action=alert, resource_type=shift_events, reason_code=CHAIN_BREAK).',
    '',
    'Next step: investigate in Flostruction Command → Audit trail.',
  ].join('\n');

  await sendOrRecord(resend, {
    from: 'FLOSTRUCTION <noreply@flosmosis.com>',
    to: recipient,
    subject,
    text: body,
  }, 'chain_integrity_alert');
}

// ─── L2.1 — Worker MFA code email ────────────────────────────────────
// Sends the 6-digit MFA code to the worker's verified email. The
// language is plain — no jargon, action-oriented per the worker-app
// voice direction.

const MFA_ACTION_HUMAN: Record<
  'DISPUTE_NEW' | 'EXPORT_FULL' | 'PHONE_CHANGE',
  { label: string; reason: string }
> = {
  DISPUTE_NEW: {
    label: 'open a dispute',
    reason: 'You are starting a dispute about your hours, pay, or records.',
  },
  EXPORT_FULL: {
    label: 'download your full records',
    reason: 'You are downloading your complete shift history.',
  },
  PHONE_CHANGE: {
    label: 'change your phone number',
    reason: 'You are changing the phone number on your worker account.',
  },
};

export async function sendWorkerMfaCodeEmail(params: {
  to: string;
  firstName?: string;
  action: 'DISPUTE_NEW' | 'EXPORT_FULL' | 'PHONE_CHANGE';
  code: string;
  expiresAt: string; // ISO
}): Promise<void> {
  const resend = getResend();
  const action = MFA_ACTION_HUMAN[params.action];
  const minsToExpire = Math.max(
    1,
    Math.round((new Date(params.expiresAt).getTime() - Date.now()) / 60000),
  );

  const greeting = params.firstName ? `Hi ${params.firstName},` : 'Hi,';
  const text = [
    greeting,
    '',
    `Your FLOSTRUCTION verification code is: ${params.code}`,
    '',
    action.reason,
    `Enter this code in the app to ${action.label}.`,
    '',
    `This code expires in ${minsToExpire} minutes.`,
    'If you did not request this code, you can ignore this email — nothing will happen without the code.',
    '',
    'Need help? Email support@flosmosis.com.',
    '',
    'FLOSMOSIS',
  ].join('\n');

  await sendOrRecord(resend, {
    from: 'FLOSTRUCTION <noreply@flosmosis.com>',
    to: params.to,
    subject: `Your FLOSTRUCTION verification code: ${params.code}`,
    text,
  }, 'worker_mfa_code');
}

// ─── L2.1 chunk 2 — Worker sign-in anomaly notification to supervisor ─
// Fires on any flagged sign-in. The tone is "please confirm with the
// worker", not "lock the account" — the auth has already succeeded
// at Supabase. This email exists so the supervisor sees the anomaly
// and can sanity-check with the worker, who can in turn revoke a
// device they don't recognise via /field settings.

const SIGNIN_FLAG_HUMAN: Record<
  'NEW_DEVICE_SIGN_IN' | 'IMPOSSIBLE_TRAVEL_SIGN_IN' | 'OFF_HOURS_SIGN_IN',
  string
> = {
  NEW_DEVICE_SIGN_IN: 'a device we have not seen them use before',
  IMPOSSIBLE_TRAVEL_SIGN_IN:
    "a country different from their last sign-in within the last 2 hours (which usually isn't physically possible)",
  OFF_HOURS_SIGN_IN: 'an unusual hour of the day for them',
};

export async function sendWorkerSignInAnomalyEmail(params: {
  to: string;
  supervisorFirstName: string | null;
  workerFirstName: string | null;
  deviceLabel: string;
  flags: Array<'NEW_DEVICE_SIGN_IN' | 'IMPOSSIBLE_TRAVEL_SIGN_IN' | 'OFF_HOURS_SIGN_IN'>;
  signedInAt: string; // ISO
  ipCountry: string | null;
}): Promise<void> {
  const resend = getResend();
  const greeting = params.supervisorFirstName ? `Hi ${params.supervisorFirstName},` : 'Hi,';
  const workerName = params.workerFirstName ?? 'Your worker';
  const reasonLines = params.flags.map((f) => `  • ${SIGNIN_FLAG_HUMAN[f]}`);
  const localTime = new Date(params.signedInAt).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const text = [
    greeting,
    '',
    `${workerName} just signed in to FLOSTRUCTION using ${params.deviceLabel}.`,
    `Sign-in time: ${localTime} AEST.`,
    params.ipCountry ? `Sign-in country (best estimate): ${params.ipCountry}.` : '',
    '',
    'We flagged this sign-in because it was from:',
    ...reasonLines,
    '',
    `Could you check in with ${workerName} and confirm it was them?`,
    'If they confirm, no further action is needed — the sign-in is logged.',
    `If they say it wasn't them, please reply to this email or contact support@flosmosis.com — we'll help them secure their account.`,
    '',
    'This is an informational notice from FLOSMOSIS.',
    'You can review all flagged sign-ins for your team in the Verify dashboard.',
  ]
    .filter(Boolean)
    .join('\n');

  await sendOrRecord(resend, {
    from: 'FLOSTRUCTION <noreply@flosmosis.com>',
    to: params.to,
    subject: `Unusual sign-in for ${workerName}`,
    text,
  }, 'worker_signin_anomaly');
}

// ─── L3.7 — Monthly chain integrity report email (placeholder) ───────
// The /api/cron/integrity-report-monthly route attempts to import this
// helper to email the founder the report summary. Implementation
// stubbed — for the soft-launch period the cron route returns the
// summary in its HTTP body and the founder reads it from Vercel logs.
// Wire to Resend after the soft-launch settles.

export async function sendIntegrityReportEmail(_params: {
  summary: Record<string, unknown>;
}): Promise<void> {
  // Intentional no-op for the soft-launch period. The cron route's
  // log line + HTTP response carry the summary; founder reads from
  // Vercel cron logs. Replace with a Resend send when the email
  // template is finalised.
  return;
}
