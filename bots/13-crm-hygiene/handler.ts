// Bot 13 — CRM hygiene.
//
// Trigger: nightly | Runtime: pg_cron->EF | Gate: T0 | Model: none.
//
// Deterministic, reversible cleanup: identify duplicate contacts, hard-bounce
// addresses to suppress, and stale stages to advance. Returns a plan (never
// mutates here) so the action is auditable and reversible.

export const BOT_ID = 'bot-13-crm-hygiene';

export interface CrmContact {
  id: string;
  email: string;
  emailStatus: 'valid' | 'hard_bounce' | 'unknown';
  lastActivityDaysAgo: number;
  stage: string;
}

export interface HygienePlan {
  duplicateIds: string[]; // ids to merge away (keep the first per email)
  suppressIds: string[]; // hard-bounced addresses to suppress
  staleIds: string[]; // no activity in 180+ days
}

/** Pure: build a reversible hygiene plan. */
export function buildHygienePlan(contacts: ReadonlyArray<CrmContact>): HygienePlan {
  const seenEmail = new Set<string>();
  const duplicateIds: string[] = [];
  const suppressIds: string[] = [];
  const staleIds: string[] = [];

  for (const c of contacts) {
    const key = c.email.trim().toLowerCase();
    if (seenEmail.has(key)) {
      duplicateIds.push(c.id);
    } else {
      seenEmail.add(key);
    }
    if (c.emailStatus === 'hard_bounce') suppressIds.push(c.id);
    if (c.lastActivityDaysAgo >= 180) staleIds.push(c.id);
  }
  return { duplicateIds, suppressIds, staleIds };
}
