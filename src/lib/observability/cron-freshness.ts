// Phase 3 / OBS-3 — cron dead-man's-switch helper.
//
// substrate-health already runs cron_health to confirm verify-hashes ran
// recently, but nothing watched substrate-health itself: if it stopped, every
// check it owns went dark with no in-substrate detector. verify-hashes (the
// other daily cron) now runs the symmetric check using this helper. The two
// crons watch each other, so a single cron dying still trips an alarm. (Total
// Vercel-cron failure still needs an EXTERNAL monitor — a Lauren-side action.)

/** Default staleness window: a daily cron that hasn't reported in >26h is dead. */
export const CRON_STALE_MS = 26 * 60 * 60 * 1000;

/**
 * Fresh iff the last run is known and newer than `maxAgeMs` ago. A null/absent
 * last-run (never recorded, or the row is gone) is treated as NOT fresh — the
 * watched cron is presumed dead until proven alive.
 */
export function isCronFresh(
  lastRunAtIso: string | null | undefined,
  nowMs: number,
  maxAgeMs: number = CRON_STALE_MS,
): boolean {
  if (!lastRunAtIso) return false;
  const t = Date.parse(lastRunAtIso);
  if (Number.isNaN(t)) return false;
  return t > nowMs - maxAgeMs;
}
