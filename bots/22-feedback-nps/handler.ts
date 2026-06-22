// Bot 22 — Feedback/NPS.
//
// Trigger: lifecycle | Runtime: pg_cron->EF | Gate: T2 send | Model: Haiku
// (synthesise themes). The NPS calculation is deterministic; Haiku only
// synthesises verbatim themes. Survey sends are gated T2.

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

/** Pure: standard NPS classification + score. */
export function computeNps(responses: ReadonlyArray<NpsResponse>): NpsResult {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of responses) {
    if (r.score >= 9) promoters++;
    else if (r.score >= 7) passives++;
    else detractors++;
  }
  const total = responses.length;
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;
  return { promoters, passives, detractors, total, nps };
}
