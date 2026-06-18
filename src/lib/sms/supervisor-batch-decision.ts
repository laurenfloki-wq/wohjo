// When to send a supervisor's batch — anchored to their site's day, not a
// single global clock.
//
// The cron polls often (every ~30 min, 7 days). On each tick this pure
// function decides, per supervisor, whether to send NOW:
//   - site day done: nobody at their sites is still on the clock AND the last
//     clock-out was at least `lagMinutes` ago → a 3pm site and an 8pm site are
//     each notified when their own day ends, not at a blunt 4:30pm;
//   - evening floor: a guaranteed send after `eveningFloorHour` (Sydney) so a
//     shift never waits past the evening of the day it was submitted;
//   - at most one send per supervisor per Sydney calendar day (SMS fatigue);
//   - shifts still pending from earlier days roll into the next day's send.
//
// Timezone-correct via the Sydney helpers (handles AEST/AEDT) — the old cron
// hardcoded a +10 offset and fired an hour early through daylight saving.

import { sydneyDateKey, sydneyHour } from '@/lib/page/today-data';

export interface SendConfig {
  /** Minutes after the last clock-out before a finished site is notified. */
  lagMinutes: number;
  /** Sydney hour (0–23) after which a pending batch is sent regardless. */
  eveningFloorHour: number;
}

export const DEFAULT_SEND_CONFIG: SendConfig = {
  lagMinutes: 60,
  eveningFloorHour: 19,
};

export interface SendDecisionInput {
  nowMs: number;
  /** end_time (ISO) of each SUBMITTED shift at the supervisor's sites. */
  pendingEndTimes: Array<string | null>;
  /** True if any shift at the supervisor's sites is still IN_PROGRESS. */
  anyInProgress: boolean;
  /** last_batch_sms_sent_at (ISO) or null. */
  lastSentAtIso: string | null;
}

export type SendReason =
  | 'no_pending'
  | 'already_sent_today'
  | 'waiting_for_day_end'
  | 'site_day_done'
  | 'evening_floor';

export interface SendDecision {
  send: boolean;
  reason: SendReason;
}

export function decideBatchSend(
  input: SendDecisionInput,
  config: SendConfig = DEFAULT_SEND_CONFIG,
): SendDecision {
  if (input.pendingEndTimes.length === 0) {
    return { send: false, reason: 'no_pending' };
  }

  const nowIso = new Date(input.nowMs).toISOString();
  if (input.lastSentAtIso && sydneyDateKey(input.lastSentAtIso) === sydneyDateKey(nowIso)) {
    return { send: false, reason: 'already_sent_today' };
  }

  // Site day done — nobody still on the clock and the last clock-out has
  // settled past the lag.
  const ends = input.pendingEndTimes
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n));
  const lastOut = ends.length > 0 ? Math.max(...ends) : null;
  const settled = lastOut !== null && input.nowMs - lastOut >= config.lagMinutes * 60_000;
  if (!input.anyInProgress && settled) {
    return { send: true, reason: 'site_day_done' };
  }

  // Evening floor — don't let a submitted shift wait past the evening.
  if (sydneyHour(new Date(input.nowMs)) >= config.eveningFloorHour) {
    return { send: true, reason: 'evening_floor' };
  }

  return { send: false, reason: 'waiting_for_day_end' };
}
