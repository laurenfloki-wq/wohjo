// Saturday Shape A — Task A4: welcome email template + dispatch.
//
// Triggered from onCheckoutSessionCompleted handler post-provision.
// Cream-charcoal canonical brand template, direct /command/dashboard
// link, first-step guidance: add your first site (per
// src/lib/onboarding/state-machine.ts STEPS the post-checkout step
// is 'site').

import { getResend } from './notify';
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';

interface WelcomeEmailInput {
  to: string;
  companyName: string;
  pricingTier: string;
  /** Founding cohort spot number (1..20) when applicable; null otherwise */
  foundingSpot?: number | null;
}

const COMMAND_URL = (() => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
  return `${appUrl.replace(/\/$/, '')}/command/dashboard`;
})();

const FROM_ADDRESS = process.env.WELCOME_EMAIL_FROM
  ?? 'FLOSTRUCTION <noreply@flosmosis.com>';

/**
 * Render the welcome email body. Exported separately so the smoke
 * test (Saturday Task A5) can snapshot the rendered output without
 * dispatching to Resend.
 *
 * Design: minimal cream-on-charcoal HTML matching the canonical
 * mockup palette (charcoal #0F0F10 surface, cream #F5F2EA primary
 * text, forest #2D5F3F confirmation accent, amber #D9A548 primary
 * CTA). Inline styles for email-client compatibility — most clients
 * ignore <style> in <head>.
 */
export function renderWelcomeEmail(input: WelcomeEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const tierLabel =
    input.pricingTier === 'founding'
      ? `Founding Cohort${input.foundingSpot ? ` · spot #${input.foundingSpot}` : ''}`
      : input.pricingTier.charAt(0).toUpperCase() + input.pricingTier.slice(1);

  const subject = 'Welcome to FLOSTRUCTION — your /command is ready';

  const text = [
    `Hi ${input.companyName},`,
    '',
    `Your FLOSTRUCTION account is ready.`,
    `Tier: ${tierLabel}`,
    '',
    `Your /command dashboard:`,
    COMMAND_URL,
    '',
    `First step: add your first site. From /command/dashboard, click`,
    `Sites → New Site, then enter the address and confirm the geofence.`,
    `Workers can clock in only at sites you've added.`,
    '',
    `If you need a hand, reply to this email and we'll sort it.`,
    '',
    `— FLOSMOSIS PTY LTD`,
    `   Foundation Entity for the WLES per Constitution v1.0 cl 7.3`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#0F0F10;color:#F5F2EA;font-family:'Inter',system-ui,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F10;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1A1A1C;border:1px solid #2A2A2C;border-radius:12px;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D9A548;margin-bottom:12px;">
          Welcome to FLOSTRUCTION
        </div>
        <h1 style="font-family:'Archivo Narrow','Helvetica Neue',sans-serif;font-size:28px;font-weight:700;margin:0 0 8px;letter-spacing:-0.012em;color:#F5F2EA;">
          Your /command is ready
        </h1>
        <p style="font-size:14px;line-height:1.55;color:rgba(245,242,234,0.75);margin:0 0 24px;">
          Hi ${escapeHtml(input.companyName)},
        </p>
        <p style="font-size:14px;line-height:1.55;color:#F5F2EA;margin:0 0 8px;">
          Your FLOSTRUCTION account is provisioned and ready to use.
        </p>
        <p style="font-size:13px;line-height:1.55;color:rgba(245,242,234,0.55);margin:0 0 24px;font-family:'JetBrains Mono',monospace;">
          Tier: ${escapeHtml(tierLabel)}
        </p>
        <div style="margin:24px 0 28px;">
          <a href="${COMMAND_URL}" style="display:inline-block;padding:12px 22px;background:#D9A548;color:#0F0F10;text-decoration:none;border-radius:6px;font-family:'JetBrains Mono',monospace;font-weight:600;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;">
            Open /command
          </a>
        </div>
        <p style="font-size:14px;line-height:1.55;color:#F5F2EA;margin:0 0 12px;">
          <strong style="color:#2D5F3F;">First step:</strong> add your first site.
        </p>
        <p style="font-size:13px;line-height:1.55;color:rgba(245,242,234,0.75);margin:0 0 24px;">
          From /command/dashboard, click Sites → New Site, then enter the
          address and confirm the geofence. Workers can clock in only at
          sites you&rsquo;ve added.
        </p>
        <p style="font-size:13px;line-height:1.55;color:rgba(245,242,234,0.55);margin:0 0 0;">
          If you need a hand, reply to this email and we&rsquo;ll sort it.
        </p>
      </td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid #2A2A2C;font-size:12px;color:rgba(245,242,234,0.55);font-family:'Inter',system-ui,sans-serif;">
        <strong style="color:#F5F2EA;">FLOSMOSIS PTY LTD</strong> &middot; ACN 697 323 925 &middot; Foundation Entity for the WLES<br/>
        Published at flosmosis.com per Constitution v1.0 cl 7.3 (open standard)
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dispatch the welcome email via Resend. Throws on Resend failure;
 * caller (the webhook handler) catches and logs as non-fatal.
 */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const { subject, text, html } = renderWelcomeEmail(input);
  const resend = getResend();
  let sendResult: { error?: { message?: string } | null } | null = null;
  try {
    sendResult = (await resend.emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject,
    text,
    html,
  })) as
      | { error?: { message?: string } | null }
      | null;
  } catch (err) {
    await recordNotificationDeadLetter({
      channel: 'resend_email',
      recipient: input.to,
      summary: { kind: 'welcome_email' },
      error: err instanceof Error ? err.message : String(err),
      context: { pricingTier: input.pricingTier, foundingSpot: input.foundingSpot },
    });
    throw err;
  }
  // B4 / SG-5: the Resend SDK reports API failures via a returned
  // { error } (no throw) — record those as dead letters too.
  if (sendResult?.error) {
    await recordNotificationDeadLetter({
      channel: 'resend_email',
      recipient: input.to,
      summary: { kind: 'welcome_email' },
      error: sendResult.error.message ?? 'resend returned error',
      context: { pricingTier: input.pricingTier, foundingSpot: input.foundingSpot },
    });
  };
}
