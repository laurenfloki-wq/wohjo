// Bot 19 — Worker onboarding.
//
// Trigger: invite event | Runtime: EF + pgmq | Gate: T1 | Model: none.
// Scripted PWA setup, geofence grant, first clock-on. The step progression is
// deterministic and idempotent — a redelivered event never advances twice or
// skips a step.

export const BOT_ID = 'bot-19-worker-onboarding';

export type WorkerStep = 'invited' | 'pwa_installed' | 'geofence_granted' | 'first_clock_on';

const ORDER: WorkerStep[] = ['invited', 'pwa_installed', 'geofence_granted', 'first_clock_on'];

/** Pure: is `to` exactly one step after `from` (a valid, non-skipping advance)? */
export function isValidAdvance(from: WorkerStep, to: WorkerStep): boolean {
  return ORDER.indexOf(to) === ORDER.indexOf(from) + 1;
}

/** Pure: apply an advance idempotently. Returns the resulting step. */
export function applyAdvance(current: WorkerStep, to: WorkerStep): WorkerStep {
  if (to === current) return current; // idempotent replay
  if (!isValidAdvance(current, to)) {
    throw new Error(`invalid worker onboarding transition: ${current} -> ${to}`);
  }
  return to;
}

/** Idempotency key per worker + step so a redelivery is a no-op. */
export function stepKey(workerId: string, step: WorkerStep): string {
  return `worker-onboarding:${workerId}:${step}`;
}
