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
