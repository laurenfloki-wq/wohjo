// Zod schemas for the Exposure Check endpoints. Validation runs server-side
// (the only place it's trusted). Public, unauthenticated endpoints, so values
// are bounded to keep them cheap and abuse-resistant (§8.5).
//
// P9: `answers` is bound to KNOWN question ids and KNOWN choice values (derived
// from the client-safe presentation + the canonical LICENCE_STATES) — not
// free-form — so junk/oversized values can't land in the jsonb column. Unknown
// ids are rejected by `.strict()`; unknown choice values by the per-question
// enums.

import { z } from 'zod';
import { PUBLIC_QUESTIONS } from './questions';
import { LICENCE_STATES } from '@/lib/seo/labour-hire-licence';

const STATE_SLUGS = LICENCE_STATES.map((s) => s.slug) as [string, ...string[]];

/** Build a strict per-question answers schema from the presentation + states. */
function buildAnswersSchema() {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const q of PUBLIC_QUESTIONS) {
    if (q.kind === 'states') {
      shape[q.id] = z.array(z.enum(STATE_SLUGS)).max(STATE_SLUGS.length).optional();
    } else {
      const values = (q.choices ?? []).map((c) => c.value) as [string, ...string[]];
      shape[q.id] = z.enum(values).optional();
    }
  }
  // .strict() → an unknown question id is rejected, not silently stored.
  return z.object(shape).strict();
}

export const AnswersSchema = buildAnswersSchema();

export type AnswersInput = z.infer<typeof AnswersSchema>;

/** POST body for /api/exposure/score. */
export const ScoreRequestSchema = z.object({
  answers: AnswersSchema,
});

/**
 * POST body for /api/exposure/lead. Contact details + the answers (re-scored
 * server-side — the client's score is never trusted). `consent` must be true:
 * explicit consent at capture (APP §8.4). `phone` is optional.
 *
 * Bot mitigation (P2): `hp` is a honeypot (a hidden field that must stay empty)
 * and `elapsed_ms` is the client-measured time the form was on screen before
 * submit; both are validated server-side and never stored.
 */
export const LeadRequestSchema = z.object({
  name: z.string().min(1, 'name required').max(120),
  work_email: z.string().email('valid work email required').max(200),
  company: z.string().min(1, 'company required').max(160),
  role: z.string().max(120).optional().default(''),
  phone: z.string().max(40).optional().default(''),
  consent: z.literal(true, { message: 'consent is required' }),
  answers: AnswersSchema,
  /** Ruleset version the client rendered (advisory; server re-scores). */
  version: z.string().max(64).optional().default(''),
  /** Optional attribution (no PII). */
  source: z.string().max(120).optional().default(''),
  utm: z.record(z.string().max(64), z.string().max(200)).optional(),
  session_id: z.string().max(64).optional().default(''),
  /** Honeypot — must be empty. A non-empty value is a bot. */
  hp: z.string().max(200).optional().default(''),
  /** Client-measured ms the form was on screen before submit (anti-bot). */
  elapsed_ms: z.number().int().nonnegative().max(86_400_000).optional(),
});

export type LeadRequestInput = z.infer<typeof LeadRequestSchema>;

/** Minimum time (ms) a genuine user takes to fill the gated form. */
export const MIN_SUBMIT_MS = 2000;
