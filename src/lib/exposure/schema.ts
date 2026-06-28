// Zod schemas for the Exposure Check endpoints. Validation runs server-side
// (the only place it's trusted). Sizes are capped to keep the public,
// unauthenticated endpoints cheap and abuse-resistant (§8.5).

import { z } from 'zod';

/** A single answer value: a choice value, or an array of them (multi/states). */
const AnswerValue = z.union([
  z.string().max(64),
  z.array(z.string().max(64)).max(16),
]);

/**
 * Raw answers keyed by question id. Bounded: at most 40 keys (we have ~9), so
 * an attacker can't post a giant object. Unknown keys are tolerated but the
 * engine only reads the ids it knows.
 */
export const AnswersSchema = z
  .record(z.string().max(64), AnswerValue)
  .refine((obj) => Object.keys(obj).length <= 40, {
    message: 'too many answers',
  });

export type AnswersInput = z.infer<typeof AnswersSchema>;

/** POST body for /api/exposure/score. */
export const ScoreRequestSchema = z.object({
  answers: AnswersSchema,
});

/**
 * POST body for /api/exposure/lead. Contact details + the answers (re-scored
 * server-side — the client's score is never trusted). `consent` must be true:
 * explicit consent at capture (APP §8.4). `phone` is optional.
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
});

export type LeadRequestInput = z.infer<typeof LeadRequestSchema>;
