// Bot 25 — Ticket triage.
//
// Trigger: inbound-ticket webhook | Runtime: EF | Gate: T0 route, T2 reply |
// Model: Haiku (classify + prioritise). Deterministic first-pass priority +
// route; Haiku refines. Routing is T0 (reversible); any reply is T2.

export const BOT_ID = 'bot-25-ticket-triage';

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketQueue = 'billing' | 'technical' | 'onboarding' | 'general';

export interface Ticket {
  subject: string;
  body: string;
  workerImpactCount: number;
}

export interface TriagedTicket {
  priority: TicketPriority;
  queue: TicketQueue;
}

const URGENT_RE = /\b(down|outage|cannot clock|can't clock|payroll wrong|urgent|locked out)\b/i;
const BILLING_RE = /\b(invoice|billing|charge|refund|payment|subscription|price)\b/i;
const TECH_RE = /\b(error|bug|crash|geofence|seal|sync|login|app)\b/i;
const ONBOARDING_RE = /\b(set ?up|onboard|invite|getting started|first worker)\b/i;

/** Pure: deterministic priority + queue. */
export function triageTicket(t: Ticket): TriagedTicket {
  const text = `${t.subject} ${t.body}`;
  let priority: TicketPriority;
  if (URGENT_RE.test(text) || t.workerImpactCount >= 20) priority = 'urgent';
  else if (t.workerImpactCount >= 5) priority = 'high';
  else if (t.workerImpactCount >= 1) priority = 'normal';
  else priority = 'low';

  let queue: TicketQueue = 'general';
  if (BILLING_RE.test(text)) queue = 'billing';
  else if (ONBOARDING_RE.test(text)) queue = 'onboarding';
  else if (TECH_RE.test(text)) queue = 'technical';

  return { priority, queue };
}
