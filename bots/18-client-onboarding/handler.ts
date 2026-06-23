// Bot 18 — Client onboarding.
//
// Trigger: new-client event | Runtime: EF + pgmq | Gate: T2 external msg |
// Model: Haiku (guidance messages). Guides employer setup to the first sealed
// clock-on and tracks progress. The step state machine is deterministic and
// idempotent; external guidance messages are gated T2.

export const BOT_ID = 'bot-18-client-onboarding';

export type SetupStep =
  | 'company_profile'
  | 'sites'
  | 'supervisors'
  | 'first_worker_invited'
  | 'first_seal';

const ORDER: SetupStep[] = [
  'company_profile',
  'sites',
  'supervisors',
  'first_worker_invited',
  'first_seal',
];

/** Pure: next setup step, or null when onboarding is complete. */
export function nextStep(step: SetupStep): SetupStep | null {
  const i = ORDER.indexOf(step);
  return i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1]! : null;
}

/** Pure: progress percentage (0-100) through the setup. */
export function progressPct(step: SetupStep): number {
  const i = ORDER.indexOf(step);
  return Math.round(((i + 1) / ORDER.length) * 100);
}

export function isComplete(step: SetupStep): boolean {
  return step === 'first_seal';
}
