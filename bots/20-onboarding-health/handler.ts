// Bot 20 — Onboarding health.
//
// Trigger: daily | Runtime: pg_cron->EF | Gate: T1/T2 | Model: none.
// Tracks onboarding milestones and surfaces stalled onboardings. Deterministic.

export const BOT_ID = 'bot-20-onboarding-health';

export type Milestone = 'invited' | 'account_created' | 'first_worker' | 'first_seal';

const ORDER: Milestone[] = ['invited', 'account_created', 'first_worker', 'first_seal'];

export interface OnboardingState {
  tenantId: string;
  milestone: Milestone;
  daysSinceLastProgress: number;
}

export interface StalledOnboarding {
  tenantId: string;
  milestone: Milestone;
  nextMilestone: Milestone | null;
  daysStalled: number;
}

/** Pure: the next milestone after the current one, or null if complete. */
export function nextMilestone(m: Milestone): Milestone | null {
  const i = ORDER.indexOf(m);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1]! : null;
}

/**
 * Pure: surface onboardings that have not progressed within `stallDays` and are
 * not yet complete (first_seal reached). Most-stalled first.
 */
export function findStalled(
  states: ReadonlyArray<OnboardingState>,
  stallDays = 3,
): StalledOnboarding[] {
  return states
    .filter((s) => s.milestone !== 'first_seal' && s.daysSinceLastProgress >= stallDays)
    .map((s) => ({
      tenantId: s.tenantId,
      milestone: s.milestone,
      nextMilestone: nextMilestone(s.milestone),
      daysStalled: s.daysSinceLastProgress,
    }))
    .sort((a, b) => b.daysStalled - a.daysStalled);
}
