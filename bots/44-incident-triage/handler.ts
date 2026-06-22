// Bot 44 — Incident triage.
//
// Trigger: Sentry webhook | Runtime: EF + pgmq (may dispatch GHA) | Gate: T2
// merge | Model: Sonnet (cause hypothesis + draft fix PR). Event grouping and
// priority are deterministic; Sonnet drafts the cause and PR, grounded in the
// gathered logs. The fix PR is drafted only — merge is gated T2.

export const BOT_ID = 'bot-44-incident-triage';

export type Priority = 'P1' | 'P2' | 'P3';

export interface SentryEvent {
  fingerprint: string;
  message: string;
  usersAffected: number;
  eventsPerHour: number;
  isRegression: boolean;
}

export interface TriagedIncident {
  fingerprint: string;
  priority: Priority;
  usersAffected: number;
  eventsPerHour: number;
}

/**
 * Pure: assign priority. P1 = broad user impact or a regression with volume;
 * P2 = meaningful volume; P3 = low. Deterministic so paging is predictable.
 */
export function prioritise(ev: SentryEvent): Priority {
  if (ev.usersAffected >= 50 || (ev.isRegression && ev.eventsPerHour >= 10)) return 'P1';
  if (ev.usersAffected >= 5 || ev.eventsPerHour >= 10) return 'P2';
  return 'P3';
}

/** Pure: collapse a burst of events to one incident per fingerprint, worst-first. */
export function groupIncidents(events: ReadonlyArray<SentryEvent>): TriagedIncident[] {
  const byFp = new Map<string, SentryEvent>();
  for (const e of events) {
    const cur = byFp.get(e.fingerprint);
    if (!cur || e.usersAffected > cur.usersAffected) byFp.set(e.fingerprint, e);
  }
  const order: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
  return [...byFp.values()]
    .map((e) => ({
      fingerprint: e.fingerprint,
      priority: prioritise(e),
      usersAffected: e.usersAffected,
      eventsPerHour: e.eventsPerHour,
    }))
    .sort((a, b) => order[a.priority] - order[b.priority] || b.usersAffected - a.usersAffected);
}
