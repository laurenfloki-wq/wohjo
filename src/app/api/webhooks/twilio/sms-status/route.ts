// NOTIF-3 — Twilio delivery-status webhook.
// POST /api/webhooks/twilio/sms-status
//
// Outbound SMS previously treated Twilio's messages.create acceptance as
// delivery — a carrier-dropped supervisor/worker text looked fully successful
// and silently delayed pay. Twilio now POSTs each message's final status here;
// an 'undelivered' / 'failed' status records a notification_dead_letter row, so
// the failure surfaces on the notification_outbound health check + alerting.
//
// Signature-validated (Twilio HMAC) before any processing, like the sms-reply
// webhook. Records nothing for success statuses (queued/sent/delivered).

import { NextResponse } from 'next/server';
import { validateTwilioSignature } from '@/lib/twilio/client';
import { recordNotificationDeadLetter } from '@/lib/notify/dead-letter';
import { routeLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const FAILED_STATUSES: ReadonlySet<string> = new Set(['undelivered', 'failed']);

export async function POST(request: Request) {
  const log = routeLogger(
    'POST /api/webhooks/twilio/sms-status',
    request.headers.get('x-request-id'),
  );

  const raw = await request.text();
  const params: Record<string, string> = Object.fromEntries(new URLSearchParams(raw));

  // Validate the Twilio signature against the exact callback URL we registered.
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const url = base ? `${base}/api/webhooks/twilio/sms-status` : new URL(request.url).toString();
  let valid = false;
  try {
    valid = validateTwilioSignature(signature, url, params);
  } catch {
    valid = false;
  }
  if (!valid) {
    log.warn({}, 'sms_status.signature_invalid');
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  const status = params.MessageStatus ?? params.SmsStatus ?? '';
  const sid = params.MessageSid ?? params.SmsSid ?? '';
  const to = params.To ?? '';

  if (FAILED_STATUSES.has(status)) {
    await recordNotificationDeadLetter({
      channel: 'twilio_sms',
      recipient: to,
      summary: { kind: 'delivery_status', sid, status },
      error: `SMS ${status}${params.ErrorCode ? ` (code ${params.ErrorCode})` : ''}`,
    });
    log.error({ sid, to, status, errorCode: params.ErrorCode ?? null }, 'sms_status.delivery_failed');
  }

  return NextResponse.json({ ok: true });
}
