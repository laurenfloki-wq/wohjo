// WLES feature flags.
//
// A single source of truth for whether the v1.0 sealing path is
// active. Imported by the 8 callsites (post-switchover) to decide
// whether to seal under legacy v0 or WLES v1.0.
//
// Default behaviour: OFF. The flag must be EXPLICITLY set to
// 'true' for v1.0 sealing to engage. This is deliberate — the
// activation is a gated operation per
// `Desktop/activation-day-checklist-2026-04-29.md` Stage 1.4.

/**
 * True if the v1.0 sealing path should be used for NEW events.
 * False if new events should seal under the legacy v0 algorithm.
 *
 * Reads `process.env.WLES_V1_ENABLED` on every call (not cached at
 * module load) — this ensures env var changes propagate without
 * needing a full redeploy on Vercel. Vercel evaluates
 * `process.env.*` fresh on every request in serverless routes.
 *
 * The flag is case-insensitive: only exactly `"true"` enables.
 * Any other value (including unset, empty string, `"false"`, `"1"`,
 * `"TRUE"`, typos) defaults to v0 (fail-closed). This protects
 * against accidental activation from typo-like env values.
 *
 * Why strict `=== 'true'` rather than truthy coercion: the cost
 * of a false-positive flip (accidental v1.0 activation) is
 * higher than the cost of a false-negative (missed activation
 * requires a 1-line env-var correction). Fail-closed wins.
 */
export function isWlesV1Enabled(): boolean {
  return process.env.WLES_V1_ENABLED === 'true';
}

/**
 * Diagnostic helper — returns the raw value of the env var for
 * logging/debugging. Never expose this in user-facing responses.
 */
export function wlesV1EnabledRaw(): string | undefined {
  return process.env.WLES_V1_ENABLED;
}

/**
 * Type-registry lock — set to `'true'` once Lauren has locked the
 * WLES v1.0 committed-type registry (2026-06-06). Until set, every
 * route that pre-seals a v1 event MUST fail closed, because any
 * event minted under a provisional payload `event_type` would be
 * permanent — the chain is append-only and existing rows cannot be
 * re-stamped.
 *
 * Routes that mint v1 events:
 *   - /api/admin/workers/bulk-upload      (WORKER_CREATED)
 *   - /api/command/export                 (EXPORT_RECORD)
 *   (plus any future writer that pre-seals before storing)
 *
 * Strictly `=== 'true'`; any other value (unset, '1', 'TRUE', empty
 * string, etc.) returns false. Fail-closed by construction.
 *
 * When the env flips to `'true'` in production:
 *   1. Confirm the relevant builders in src/lib/wles/v1-translate.ts
 *      emit the FINAL agreed committed-type strings.
 *   2. Confirm the WLES spec/paper §7 matches.
 *   3. Deploy. Routes begin minting v1 events with the locked strings.
 */
export function isWlesTypeRegistryLocked(): boolean {
  return process.env.WLES_TYPE_REGISTRY_LOCKED === 'true';
}
