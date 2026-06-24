// Stripe billing lifecycle customer-comms emails (Workstream 1).
//
// Five side-effect emails dispatched from the Stripe webhook handlers:
//   - trial-ending reminder   (customer.subscription.trial_will_end)
//   - receipt                 (invoice.paid)
//   - dunning                 (invoice.payment_failed)
//   - upcoming-invoice        (invoice.upcoming)
//   - dispute founder-alert   (charge.dispute.created)
//
// Reuses the same Resend path sendWelcomeEmail uses (getResend + the
// notification dead-letter) — NO new provider. Each send throws only on a
// hard (network/exception) Resend failure so the calling handler's try/catch
// can log it non-fatally; a returned { error } is recorded as a dead letter
// and swallowed, exactly like the welcome email. A down email provider must
// never make Stripe retry a successfully-processed event or move entitlement.

import { getResend } from './notify';
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';

const FROM_ADDRESS = process.env.BILLING_EMAIL_FROM ?? 'FLOSTRUCTION <noreply@flosmosis.com>';

/** Founder alert recipient — same resolution as notifyChainIntegrityAlert. */
const FOUNDER_ALERT_TO = process.env.ALERT_EMAIL_TO ?? 'lauren.flosmosis@gmail.com';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.flosmosis.com').replace(/\/$/, '');
const BILLING_URL = `${APP_URL}/command/settings/billing`;

// ── Shared dispatch (mirror of sendWelcomeEmail's Resend + dead-letter) ──────

async function dispatch(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const resend = getResend();
  let sendResult: { error?: { message?: string } | null } | null = null;
  try {
    sendResult = (await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    })) as { error?: { message?: string } | null } | null;
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'resend_email',
      recipient: params.to,
      summary: { kind: params.kind, subject: params.subject },
      error: err instanceof Error ? err.message : String(err),
      ...(params.context ? { context: params.context } : {}),
    });
    throw err; // hard failure — caller logs non-fatally
  }
  // SDK-level returned error (no throw): record as a dead letter, swallow.
  if (sendResult?.error) {
    await recordNotificationDeadLetter({
      channel: 'resend_email',
      recipient: params.to,
      summary: { kind: params.kind, subject: params.subject },
      error: sendResult.error.message ?? 'resend returned error',
      ...(params.context ? { context: params.context } : {}),
    });
  }
}

// ── Presentation helpers ─────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** cents + ISO currency → "$1,234.56 AUD". Stripe amounts are in minor units. */
export function formatAmount(amountMinor: number, currency: string): string {
  const code = (currency || 'aud').toUpperCase();
  const major = (amountMinor / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${major} ${code}`;
}

function formatDate(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Canonical cream-on-charcoal shell matching the welcome email palette. */
function shell(opts: {
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
}): string {
  const ctaHtml = opts.cta
    ? `<div style="margin:24px 0 4px;">
         <a href="${opts.cta.url}" style="display:inline-block;padding:12px 22px;background:#D9A548;color:#0F0F10;text-decoration:none;border-radius:6px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">${escapeHtml(opts.cta.label)}</a>
       </div>`
    : '';
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#0F0F10;color:#F5F2EA;font-family:'Inter',system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F10;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1A1A1C;border:1px solid #2A2A2C;border-radius:12px;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D9A548;margin-bottom:12px;">${escapeHtml(opts.eyebrow)}</div>
        <h1 style="font-family:'Archivo Narrow','Helvetica Neue',sans-serif;font-size:26px;font-weight:700;margin:0 0 16px;letter-spacing:-0.012em;color:#F5F2EA;">${escapeHtml(opts.heading)}</h1>
        <div style="font-size:14px;line-height:1.55;color:#F5F2EA;">${opts.bodyHtml}</div>
        ${ctaHtml}
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #2A2A2C;font-size:12px;color:rgba(245,242,234,0.55);">
        <strong style="color:#F5F2EA;">FLOSMOSIS PTY LTD</strong> &middot; ACN 697 323 925 &middot; Foundation Entity for the WLES
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── 1. Trial ending (7-day-out) ──────────────────────────────────────────────

export interface TrialEndingInput {
  to: string;
  companyName?: string | null;
  trialEndsAt: number | null; // unix seconds
}

export function renderTrialEndingEmail(input: TrialEndingInput): {
  subject: string;
  text: string;
  html: string;
} {
  const when = formatDate(input.trialEndsAt);
  const hi = input.companyName ? `Hi ${input.companyName},` : 'Hi,';
  const subject = 'Your FLOSTRUCTION trial ends in 7 days';
  const text = [
    hi,
    '',
    `Your FLOSTRUCTION free trial ends${when ? ` on ${when}` : ' soon'}.`,
    'To keep your /command running without interruption, make sure a payment',
    'method is on file. Your sealed records and pay history always stay accessible.',
    '',
    `Manage billing: ${BILLING_URL}`,
    '',
    '— FLOSMOSIS PTY LTD',
  ].join('\n');
  const html = shell({
    eyebrow: 'Trial ending soon',
    heading: 'Your trial ends in 7 days',
    bodyHtml: `<p style="margin:0 0 12px;">${escapeHtml(hi)}</p>
      <p style="margin:0 0 12px;">Your FLOSTRUCTION free trial ends${when ? ` on <strong>${escapeHtml(when)}</strong>` : ' soon'}.</p>
      <p style="margin:0 0 12px;">To keep your /command running without interruption, make sure a payment method is on file. Your sealed records and pay history always stay accessible.</p>`,
    cta: { label: 'Manage billing', url: BILLING_URL },
  });
  return { subject, text, html };
}

export async function sendTrialEndingEmail(input: TrialEndingInput): Promise<void> {
  const { subject, text, html } = renderTrialEndingEmail(input);
  await dispatch({
    to: input.to,
    subject,
    text,
    html,
    kind: 'trial_ending',
    context: { trialEndsAt: input.trialEndsAt },
  });
}

// ── 2. Receipt (invoice.paid) ────────────────────────────────────────────────

export interface ReceiptInput {
  to: string;
  amountPaidMinor: number;
  currency: string;
  invoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  paidAt?: number | null; // unix seconds
}

export function renderReceiptEmail(input: ReceiptInput): {
  subject: string;
  text: string;
  html: string;
} {
  const amount = formatAmount(input.amountPaidMinor, input.currency);
  const when = formatDate(input.paidAt);
  const ref = input.invoiceNumber ? ` (invoice ${input.invoiceNumber})` : '';
  const subject = `Payment received — ${amount}`;
  const text = [
    'Thanks — your payment was received.',
    '',
    `Amount: ${amount}${ref}`,
    when ? `Date: ${when}` : '',
    input.hostedInvoiceUrl ? `View / download invoice: ${input.hostedInvoiceUrl}` : '',
    '',
    '— FLOSMOSIS PTY LTD',
  ]
    .filter(Boolean)
    .join('\n');
  const html = shell({
    eyebrow: 'Payment received',
    heading: `Payment received — ${amount}`,
    bodyHtml: `<p style="margin:0 0 12px;">Thanks — your payment was received.</p>
      <p style="margin:0 0 6px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Amount: ${escapeHtml(amount)}${escapeHtml(ref)}</p>
      ${when ? `<p style="margin:0 0 12px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Date: ${escapeHtml(when)}</p>` : ''}`,
    ...(input.hostedInvoiceUrl
      ? { cta: { label: 'View invoice', url: input.hostedInvoiceUrl } }
      : {}),
  });
  return { subject, text, html };
}

export async function sendReceiptEmail(input: ReceiptInput): Promise<void> {
  const { subject, text, html } = renderReceiptEmail(input);
  await dispatch({
    to: input.to,
    subject,
    text,
    html,
    kind: 'receipt',
    context: { amountPaidMinor: input.amountPaidMinor },
  });
}

// ── 3. Dunning (invoice.payment_failed) ──────────────────────────────────────

export interface DunningInput {
  to: string;
  amountDueMinor: number;
  currency: string;
  attemptCount: number;
  nextAttemptAt?: number | null; // unix seconds
  hostedInvoiceUrl?: string | null;
}

export function renderDunningEmail(input: DunningInput): {
  subject: string;
  text: string;
  html: string;
} {
  const amount = formatAmount(input.amountDueMinor, input.currency);
  const next = formatDate(input.nextAttemptAt);
  const subject = 'Action needed — your payment did not go through';
  const text = [
    'We were not able to process your most recent FLOSTRUCTION payment.',
    '',
    `Amount due: ${amount}`,
    `Attempt: ${input.attemptCount}`,
    next ? `We will try again on ${next}.` : 'We will try again automatically.',
    '',
    'Please check the card on file so your /command is not interrupted. Your',
    'sealed records and pay history stay accessible regardless.',
    '',
    `Update payment method: ${BILLING_URL}`,
    '',
    '— FLOSMOSIS PTY LTD',
  ].join('\n');
  const html = shell({
    eyebrow: 'Payment failed',
    heading: 'Your payment did not go through',
    bodyHtml: `<p style="margin:0 0 12px;">We were not able to process your most recent FLOSTRUCTION payment.</p>
      <p style="margin:0 0 6px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Amount due: ${escapeHtml(amount)} &middot; attempt ${input.attemptCount}</p>
      <p style="margin:0 0 12px;">${next ? `We will try again on <strong>${escapeHtml(next)}</strong>.` : 'We will try again automatically.'} Please check the card on file so your /command is not interrupted — your sealed records and pay history stay accessible regardless.</p>`,
    cta: { label: 'Update payment method', url: BILLING_URL },
  });
  return { subject, text, html };
}

export async function sendDunningEmail(input: DunningInput): Promise<void> {
  const { subject, text, html } = renderDunningEmail(input);
  await dispatch({
    to: input.to,
    subject,
    text,
    html,
    kind: 'dunning',
    context: { attemptCount: input.attemptCount },
  });
}

// ── 4. Upcoming invoice (invoice.upcoming) ───────────────────────────────────

export interface UpcomingInput {
  to: string;
  amountDueMinor: number;
  currency: string;
  nextChargeAt?: number | null; // unix seconds
}

export function renderUpcomingInvoiceEmail(input: UpcomingInput): {
  subject: string;
  text: string;
  html: string;
} {
  const amount = formatAmount(input.amountDueMinor, input.currency);
  const when = formatDate(input.nextChargeAt);
  const subject = `Upcoming charge — ${amount}`;
  const text = [
    'A heads-up on your next FLOSTRUCTION charge.',
    '',
    `Amount: ${amount}`,
    when ? `Charge date: ${when}` : 'Charge date: in about 7 days',
    '',
    'No action is needed if your payment details are up to date.',
    '',
    `Manage billing: ${BILLING_URL}`,
    '',
    '— FLOSMOSIS PTY LTD',
  ].join('\n');
  const html = shell({
    eyebrow: 'Upcoming charge',
    heading: `Upcoming charge — ${amount}`,
    bodyHtml: `<p style="margin:0 0 12px;">A heads-up on your next FLOSTRUCTION charge.</p>
      <p style="margin:0 0 12px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Amount: ${escapeHtml(amount)}${when ? ` &middot; ${escapeHtml(when)}` : ' &middot; in ~7 days'}</p>
      <p style="margin:0 0 12px;">No action is needed if your payment details are up to date.</p>`,
    cta: { label: 'Manage billing', url: BILLING_URL },
  });
  return { subject, text, html };
}

export async function sendUpcomingInvoiceEmail(input: UpcomingInput): Promise<void> {
  const { subject, text, html } = renderUpcomingInvoiceEmail(input);
  await dispatch({
    to: input.to,
    subject,
    text,
    html,
    kind: 'upcoming_invoice',
    context: { amountDueMinor: input.amountDueMinor },
  });
}

// ── 5. Dispute founder-alert (charge.dispute.created) ────────────────────────

export interface DisputeAlertInput {
  disputeId: string;
  amountMinor: number;
  currency: string;
  reason?: string | null;
  evidenceDueBy?: number | null; // unix seconds
  chargeId?: string | null;
}

export function renderDisputeAlertEmail(input: DisputeAlertInput): {
  subject: string;
  text: string;
  html: string;
} {
  const amount = formatAmount(input.amountMinor, input.currency);
  const due = formatDate(input.evidenceDueBy);
  const subject = `URGENT — Stripe dispute opened (${amount})`;
  const text = [
    'A payment dispute (chargeback) has been opened against a FLOSTRUCTION charge.',
    '',
    `Dispute: ${input.disputeId}`,
    `Amount: ${amount}`,
    input.reason ? `Reason: ${input.reason}` : '',
    input.chargeId ? `Charge: ${input.chargeId}` : '',
    due ? `Evidence due by: ${due}` : '',
    '',
    'Pause-service is a founder-led decision — review in the Stripe dashboard.',
    '',
    '— FLOSTRUCTION billing watch',
  ]
    .filter(Boolean)
    .join('\n');
  const html = shell({
    eyebrow: 'Dispute opened',
    heading: `Stripe dispute opened — ${amount}`,
    bodyHtml: `<p style="margin:0 0 12px;">A payment dispute (chargeback) has been opened against a FLOSTRUCTION charge.</p>
      <p style="margin:0 0 6px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Dispute: ${escapeHtml(input.disputeId)}</p>
      <p style="margin:0 0 6px;font-family:'JetBrains Mono',monospace;color:rgba(245,242,234,0.75);">Amount: ${escapeHtml(amount)}${input.reason ? ` &middot; ${escapeHtml(input.reason)}` : ''}</p>
      ${due ? `<p style="margin:0 0 12px;font-family:'JetBrains Mono',monospace;color:#D9A548;">Evidence due by: ${escapeHtml(due)}</p>` : ''}
      <p style="margin:0 0 12px;">Pause-service is a founder-led decision — review in the Stripe dashboard.</p>`,
  });
  return { subject, text, html };
}

export async function sendDisputeAlertEmail(input: DisputeAlertInput): Promise<void> {
  const { subject, text, html } = renderDisputeAlertEmail(input);
  await dispatch({
    to: FOUNDER_ALERT_TO,
    subject,
    text,
    html,
    kind: 'dispute_alert',
    context: { disputeId: input.disputeId, amountMinor: input.amountMinor },
  });
}
