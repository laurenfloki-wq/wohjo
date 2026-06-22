// Bot 25 — Ticket triage.
//
// Trigger: inbound-ticket webhook | Runtime: EF | Gate: T0 route, T2 reply |
// Model: Haiku (classify + prioritise). Deterministic first-pass priority +
// route; Haiku refines. Routing is T0 (reversible); any reply is T2.

import { TRIAGE } from '../config';

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
  /** Anything that blocks pay or the sealed record is existential — page on it. */
  payImpacting: boolean;
}

// Anything touching pay, the clock-on, or the sealed record is existential for a
// time-verification product: a blocked clock-on or wrong payroll means a worker
// is not paid correctly. These are always urgent regardless of headcount.
const PAY_IMPACTING_RE =
  /\b(cannot clock|can'?t clock|clock[- ]?on (fail|down|broken)|payroll wrong|not paid|wage|underpaid|seal (fail|missing|broken)|missing hours|wrong hours)\b/i;
const OUTAGE_RE = /\b(down|outage|urgent|locked out|nothing works)\b/i;
const BILLING_RE = /\b(invoice|billing|charge|refund|payment|subscription|price)\b/i;
const TECH_RE = /\b(error|bug|crash|geofence|seal|sync|login|app)\b/i;
const ONBOARDING_RE = /\b(set ?up|onboard|invite|getting started|first worker)\b/i;

/** Pure: deterministic priority + queue, calibrated to the product's stakes. */
export function triageTicket(t: Ticket): TriagedTicket {
  const text = `${t.subject} ${t.body}`;
  const payImpacting = PAY_IMPACTING_RE.test(text);

  let priority: TicketPriority;
  if (payImpacting || OUTAGE_RE.test(text) || t.workerImpactCount >= TRIAGE.urgentWorkerImpact) {
    priority = 'urgent';
  } else if (t.workerImpactCount >= TRIAGE.highWorkerImpact) priority = 'high';
  else if (t.workerImpactCount >= 1) priority = 'normal';
  else priority = 'low';

  let queue: TicketQueue = 'general';
  if (BILLING_RE.test(text)) queue = 'billing';
  else if (ONBOARDING_RE.test(text)) queue = 'onboarding';
  else if (TECH_RE.test(text) || payImpacting) queue = 'technical';

  return { priority, queue, payImpacting };
}
