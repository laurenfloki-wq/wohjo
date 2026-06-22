// Bot 22 — Feedback/NPS.
//
// Trigger: lifecycle | Runtime: pg_cron->EF | Gate: T2 send | Model: Haiku
// (synthesise themes). The NPS calculation is deterministic; Haiku only
// synthesises verbatim themes. Survey sends are gated T2. Each response carries
// a follow-up play (referral / nurture / save) so NPS drives action.

import { NPS } from '../config';

export const BOT_ID = 'bot-22-feedback-nps';

export interface NpsResponse {
  /** 0-10 likelihood-to-recommend score. */
  score: number;
  comment: string;
}

export interface NpsResult {
  promoters: number; // 9-10
  passives: number; // 7-8
  detractors: number; // 0-6
  total: number;
  /** NPS = %promoters - %detractors, rounded to an integer (-100..100). */
  nps: number;
}

export type NpsPlay = 'referral_and_case_study' | 'nurture_to_promoter' | 'save_play';

/**
 * Pure: the follow-up play for a single response. A promoter is an asset (ask
 * for a referral, a case study, a review); a detractor is a churn risk (save
 * play, route to success); a passive is a nudge. This is what turns NPS from a
 * vanity number into pipeline + retention.
 */
export function npsPlay(score: number): NpsPlay {
  if (score >= NPS.promoterMin) return 'referral_and_case_study';
  if (score >= NPS.passiveMin) return 'nurture_to_promoter';
  return 'save_play';
}

/** Pure: standard NPS classification + score. */
export function computeNps(responses: ReadonlyArray<NpsResponse>): NpsResult {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of responses) {
    if (r.score >= NPS.promoterMin) promoters++;
    else if (r.score >= NPS.passiveMin) passives++;
    else detractors++;
  }
  const total = responses.length;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
  return { promoters, passives, detractors, total, nps };
}
