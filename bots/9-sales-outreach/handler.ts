// Bot 9 — Sales outreach.
//
// Trigger: manual enrol | Runtime: EF (HTTP) | Gate: T2 send | Model: Sonnet
// (personalise). Drafts are taken to the send-edge but never auto-sent. Every
// outreach email must carry the ABN + a functional unsubscribe (Spam Act) and
// be emoji-free; buildOutreachEmail asserts that, so a non-compliant outreach
// cannot reach the T2 send gate.

import { assertSpamActCompliant, type OutboundEmail } from '../../platform/guard';

export const BOT_ID = 'bot-9-sales-outreach';

export interface OutreachInput {
  toEmail: string;
  subject: string;
  /** Sonnet-personalised body, without the compliance footer. */
  bodyDraft: string;
  abn: string;
  unsubscribeUrl: string;
}

/**
 * Pure: assemble the compliant outreach email and assert Spam Act compliance.
 * Throws GuardError if ABN/unsubscribe missing or emoji present.
 */
export function buildOutreachEmail(input: OutreachInput): OutboundEmail {
  const body =
    `${input.bodyDraft}\n\n` +
    `FLOSMOSIS PTY LTD ABN ${input.abn}\n` +
    `Unsubscribe: ${input.unsubscribeUrl}`;
  const email: OutboundEmail = { to: input.toEmail, subject: input.subject, body };
  assertSpamActCompliant(email);
  return email;
}
