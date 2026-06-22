# DECISIONS — FLOSMOSIS Bot Fleet

Assumptions log. Every ambiguity resolved during the autonomous build, with a one-line rationale.
Newest entries at the top.

## Sales & lifecycle (build phase 7)

- **`bots/15-proposal-quote/pricing-spec.ts` carries documented PLACEHOLDER pricing with the correct shape (tier base + per-active-worker + included workers).** The real Pricing Spec v1.0 is a signed business artefact not present in this repo. The quote maths is exact and tested against the spec module, so swapping in the real figures requires no code change. Rationale: never block the build on a missing artefact; keep pricing in one canonical module the bot prices strictly from.

## Platform foundation (build phase 1)

- **Edge Functions live under `supabase/functions/` (CLI convention), not a top-level `/functions`.** Rationale: `supabase functions deploy` hard-requires that path; the spec's logical `/functions` maps here. They use Deno URL imports and are excluded from the root `tsc` and from eslint (typed linting would error on files outside the TS project).
- **`/health` is self-contained Deno (supabase-js), not an import of `platform/obs`.** Rationale: `platform/db` uses postgres.js (Node-only); the health endpoint must run in the Deno Edge runtime, so it does its own reachability check.
- **`fleet-deploy.yml` deploy steps are guarded on `secrets.SUPABASE_ACCESS_TOKEN` presence.** Rationale: OPERATING MANDATE rule 5 — never block on a missing secret; the workflow is inert (gate-only) until credentials are provisioned, and never deploys with live money/evidence credentials during the build.

- **Bot fleet lives in additive top-level folders, never inside the existing Next.js `src/`.** The repo is the live FLOSTRUCTION product; the fleet is operational tooling. Folders: `/platform`, `/bots`, `/functions`, `/supabase`, `/evals`, `/eng`, `/approval-ui`. Rationale: keep product and ops codebases cleanly separable; the spec mandates exactly this layout.
- **Bot platform SQL lives in `/supabase/migrations`, separate from the product's `/migrations`.** Rationale: the product already has 100 migrations under `/migrations` driven by its own tooling; bot-platform tables are an isolated namespace (`bot_*`) and must not interleave with product migration ordering.
- **All bot platform tables are prefixed `bot_`** (`bot_audit_ledger`, `bot_runs`, `bot_config`, `bot_approval_requests`, `bot_idempotency_keys`, `bot_kb_chunks`). Rationale: the product already owns `audit`-flavoured tables and a product-level hash chain; prefixing prevents collision and makes the fleet's footprint greppable.
- **The `/platform` library is runtime-agnostic TypeScript using web-standard APIs (`fetch`, Web Crypto where possible).** Rationale: the same modules must run in Node (evals, Vercel routes) and Deno (Supabase Edge Functions) without a build step. Edge Functions in `/functions` are excluded from the root `tsc` because they use Deno-style URL imports.
- **The Claude client (`platform/llm.ts`) calls the Anthropic REST API directly via `fetch`, not the SDK.** Rationale: avoids adding a dependency; keeps the module Deno-compatible; we fully control caching headers and the Batch endpoint.
- **Model routing:** Haiku tier -> `claude-haiku-4-5-20251001` (classify/extract/route/tag/short-summary); Sonnet tier -> `claude-sonnet-4-6` (draft/reason/redline/grounded-answer). Rationale: matches MODEL TIERING; latest available ids at build time.
- **`platform/db.ts` uses `postgres` (postgres.js), matching the product's existing data access.** Rationale: dependency already present; consistent connection handling.
- **Logging reuses the `pino` pattern from `src/lib/logger.ts` but as a standalone `platform/log.ts`** so the fleet never imports product internals. Rationale: keep the boundary clean; same redaction posture.
- **`FLOSMOSIS_ABN` and unsubscribe markers are configuration, read from env.** The real ABN is a secret/config value, not hardcoded. The Spam Act guard asserts the configured ABN string and a functional unsubscribe token are present in any outbound email. Rationale: avoids embedding a possibly-wrong ABN in source; see SECRETS.md.
- **Emoji detection uses a Unicode property-escape regex (`\p{Extended_Pictographic}` plus regional indicators and variation selectors).** Rationale: deterministic, no LLM, covers the Output Hygiene constraint structurally.
- **Approval gates are enforced in code, not by waiting for a human at build time.** Every gated path writes a `bot_approval_requests` row and parks the durable message; the live trigger stays behind the gate. Rationale: per the OPERATING MANDATE, building the gate is authorised; firing the side-effect is the director's.
