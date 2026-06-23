// Bot 53 — Inbox triage.
//
// Trigger: Gmail push webhook | Runtime: EF + pgmq | Gate: T2 customer-facing |
// Model: Haiku/Sonnet (classify + draft). Surfaces only what needs a director;
// drafts customer-facing replies but never auto-sends them. Classification is a
// deterministic first pass.

export const BOT_ID = 'bot-53-inbox-triage';

export type MailCategory = 'customer' | 'vendor' | 'internal' | 'newsletter' | 'spam';

export interface InboundMail {
  fromDomain: string;
  subject: string;
  body: string;
  isReplyToOurThread: boolean;
}

export interface TriagedMail {
  category: MailCategory;
  /** Surface to a director? (customer-facing or anything needing a decision) */
  needsDirector: boolean;
  /** Draft a reply? Customer mail is drafted (T2, never auto-sent). */
  shouldDraft: boolean;
}

const SPAM_RE = /\b(viagra|lottery|prince|crypto giveaway|unsubscribe to win)\b/i;
const NEWSLETTER_RE = /\b(newsletter|digest|weekly update|no-?reply)\b/i;
const URGENT_RE = /\b(urgent|asap|legal|breach|refund|complaint|cancel)\b/i;

const INTERNAL_DOMAINS = new Set(['flosmosis.com']);
const VENDOR_DOMAINS = new Set(['stripe.com', 'xero.com', 'twilio.com', 'github.com']);

/** Pure: deterministic mail classification + surfacing. */
export function triageMail(m: InboundMail): TriagedMail {
  const text = `${m.subject} ${m.body}`;
  let category: MailCategory;
  if (SPAM_RE.test(text)) category = 'spam';
  else if (INTERNAL_DOMAINS.has(m.fromDomain)) category = 'internal';
  else if (VENDOR_DOMAINS.has(m.fromDomain)) category = 'vendor';
  else if (NEWSLETTER_RE.test(text)) category = 'newsletter';
  else category = 'customer';

  const isCustomer = category === 'customer';
  const needsDirector = isCustomer || (category !== 'spam' && URGENT_RE.test(text));
  const shouldDraft = isCustomer; // customer-facing draft, T2, never auto-sent
  return { category, needsDirector, shouldDraft };
}
