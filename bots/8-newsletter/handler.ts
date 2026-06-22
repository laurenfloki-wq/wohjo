// Bot 8 — Newsletter.
//
// Trigger: monthly | Runtime: pg_cron->EF | Gate: T2 send | Model: Sonnet
// (draft). Assembles content and drafts the newsletter; the send is structurally
// blocked unless it is Spam Act compliant (ABN + functional unsubscribe) and
// emoji-free. assembleNewsletter runs that guard, so a non-compliant newsletter
// cannot proceed to the T2 send gate.

import { assertSpamActCompliant, type OutboundEmail } from '../../platform/guard';

export const BOT_ID = 'bot-8-newsletter';

export interface NewsletterItem {
  heading: string;
  body: string;
}

export interface NewsletterInput {
  subject: string;
  intro: string;
  items: ReadonlyArray<NewsletterItem>;
  abn: string;
  unsubscribeUrl: string;
}

/**
 * Pure: assemble the newsletter email and assert Spam Act compliance. Throws a
 * GuardError if the ABN or unsubscribe is missing, or if any emoji is present.
 * Returns the compliant email ready for the T2 send gate.
 */
export function assembleNewsletter(input: NewsletterInput): OutboundEmail {
  const sections = input.items.map((i) => `${i.heading}\n${i.body}`).join('\n\n');
  const body =
    `${input.intro}\n\n${sections}\n\n` +
    `FLOSMOSIS PTY LTD ABN ${input.abn}\n` +
    `Unsubscribe: ${input.unsubscribeUrl}`;
  const email: OutboundEmail = { to: 'subscribers', subject: input.subject, body };
  assertSpamActCompliant(email);
  return email;
}
