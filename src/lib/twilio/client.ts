// Flosmosis — Twilio Client (server-side only)
// Non-negotiable: Twilio credentials never exposed to client.

import Twilio from 'twilio';

let _client: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient(): ReturnType<typeof Twilio> {
  if (!_client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
    }
    _client = Twilio(accountSid, authToken);
  }
  return _client;
}

export function getTwilioFromNumber(): string {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) throw new Error('TWILIO_FROM_NUMBER is required');
  return from;
}

/**
 * NOTIF-3 — statusCallback URL for outbound SMS. Twilio POSTs delivery status
 * here; the route records undelivered/failed finals into notification_dead_letter
 * so a carrier-dropped supervisor/worker text stops looking successful. Returns
 * undefined when NEXT_PUBLIC_APP_URL is unset (the param is then simply omitted).
 */
export function getSmsStatusCallback(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  return base ? `${base}/api/webhooks/twilio/sms-status` : undefined;
}

/** Spreadable form for messages.create — omits statusCallback entirely when
 *  unconfigured (exactOptionalPropertyTypes-safe; never passes undefined). */
export function smsStatusCallbackOpts(): { statusCallback?: string } {
  const cb = getSmsStatusCallback();
  return cb ? { statusCallback: cb } : {};
}

/**
 * Validate an inbound Twilio webhook request signature.
 * Non-negotiable: called before ANY processing of inbound SMS.
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) throw new Error('TWILIO_AUTH_TOKEN is required');
  return Twilio.validateRequest(authToken, signature, url, params);
}
