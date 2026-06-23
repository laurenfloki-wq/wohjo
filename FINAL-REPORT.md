# FLOSMOSIS Bot Fleet — Final Build Report

## Outcome

The complete fleet is built: **all 54 bots** in the spec (numbers 1-47 and 52-58),
on a shared deterministic platform, additive to the FLOSTRUCTION product app. No
product source was changed except `tsconfig.json` (exclude Deno Edge Functions
from the Node typecheck) and `eslint.config.mjs` (ignore the same).

Gate status on every commit:

- `tsc --noEmit`: clean
- Fleet eval suite: **154 golden evals pass** (`npx vitest run platform bots evals`)
- `eslint`: clean

## What was built

### Shared platform (`/platform`)

Runtime-agnostic TypeScript (Node + Deno), web-standard APIs, no framework that
hides prompts or control flow, no Claude SDK dependency (direct REST via fetch).

- `env`, `log` (pino + secret redaction), `db` (postgres.js, lazy/serverless)
- `audit` — append-only, hash-chained ledger (`record` / `verifyChain`); chain in a DB trigger
- `guard` — deterministic Spam Act (ABN + unsubscribe), no-emoji, grounding; never an LLM
- `llm` — single Claude client: model tiering (Haiku/Sonnet), prompt caching, global kill switch, per-bot budget, cost logging, strict-JSON
- `queue` — pgmq `enqueue` / `drain` / claim-once idempotency
- `hitl` — approval gates: request / resolve / expire, park + resume durable flows
- `obs` — health + per-bot/fleet cost views
- `money` — integer-cents GST helpers
- `connectors` — Stripe, HubSpot, Xero (scoped credentials, signature verify)

### Data model (`supabase/migrations/0001_bot_platform_core.sql`)

`bot_audit_ledger` (append-only, hash chain, UPDATE/DELETE revoked), `bot_config`
(enable + budget + global kill switch), `bot_runs`, `bot_idempotency_keys`,
`bot_approval_requests`, `bot_kb_chunks` (pgvector). Extensions: pgcrypto, vector,
pg_cron, pgmq, pg_net.

### Runtime + ops

`/health` Edge Function (Deno); Stripe webhook receiver (Deno); `fleet-deploy.yml`
(gate -> guarded deploy on push to main); `fleet-ci-gate.yml` (bot 42, PR gate);
eval harness.

### The 54 bots (by phase)

- Safety spine: 30 compliance guard, 6 brand-voice, 57 approval router
- Finance (durable money): 34, 35, 41, 36, 38, 40, 37, 39
- CRM: 12, 10, 13, 11, 16, 17
- Engineering (GitHub Actions): 42, 45, 47, 43, 44, 46
- Growth: 1, 2, 4, 3, 5, 7, 8
- Sales + lifecycle: 15, 22, 21, 20, 9, 14, 18, 19
- Support: 23, 24, 25, 26
- Legal/compliance: 27, 28, 29, 31, 32, 33
- Internal ops/cockpit: 52, 53, 54, 55, 56, 58

Each bot folder has a handler, a README (what/trigger/runtime/gate/cost), and
`*.eval.test.ts` golden cases. `FLEET.md` is the live index.

## Design discipline

- **Deterministic spine, LLM only at genuine decision points.** Every
  compliance-, money-, and grounding-critical path is a pure, unit-tested
  function; LLMs draft/reason/classify only where a rule cannot.
- **Gates enforced in code.** No external customer/lead/regulator message is ever
  auto-sent: drafting is automated, sending sits behind T2/T3 with the approval
  queue + compliance guards. Money disbursement and filings are dual-control.
- **Idempotent + durable.** Money/evidence flows claim an idempotency key and run
  on pgmq; replays and re-drains cause no duplicate side-effect.
- **Auditable.** Consequential steps write to the hash-chained ledger.
- **Cost-controlled.** Model tiering (Haiku classify/extract, Sonnet draft/reason),
  prompt caching, per-bot budget, global kill switch; cost logged to `bot_runs`.

## Decisions (see `DECISIONS.md` for the full log)

Notable: bot-platform tables isolated under a `bot_` prefix and `supabase/migrations`,
separate from the product's 100 migrations; Edge Functions under
`supabase/functions/` (CLI convention) excluded from the Node typecheck; pricing in
`bots/15-proposal-quote/pricing-spec.ts` carries documented placeholder figures
pending the signed Pricing Spec v1.0; the real ABN is configuration, not source.

## Secrets required (see `SECRETS.md`)

All wired to env placeholders; the code is complete and typecheck-clean without
them. Core: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`ANTHROPIC_API_KEY`, `FLOSMOSIS_ABN`, `FLOSMOSIS_UNSUBSCRIBE_BASE_URL`. Plus
provider credentials per connector (Stripe, Xero, HubSpot, Resend, Twilio, GitHub,
Sentry) and notification targets for the approval router.

## What is deliberately NOT done (the director's gate, not a build gap)

Firing live external side-effects (real emails/SMS, moving money, regulator
filings) and deploying to production with live credentials. Every such path is
BUILT and left behind its gate, per the operating mandate.

## Running cost vs the near-zero target

- Infrastructure: **~0 AUD** — Supabase free/Pro, Vercel Hobby, GitHub Actions free
  tier. The only likely infra line item is Supabase Pro if free limits are exceeded.
- LLM inference: the only variable cost, attributed per bot in `bot_runs` and
  capped by per-bot budgets + the global kill switch. Most bots are deterministic
  (no LLM); the token-heaviest is bot 23 (support), mitigated by prompt caching on
  the KB context and a Haiku route.

## Self-verify checklist (mechanisms in place; live DB assertions run in CI)

- Ledger append-only + hash-chained: DB trigger computes the chain; UPDATE/DELETE
  revoked; `verifyChain()` recomputes end-to-end.
- Rejected approval runs the compensating path: `decideNext` -> compensate topic
  (bot 57), unit-tested.
- Redelivered webhook / re-drained pgmq: `claimIdempotency` claim-once, exercised
  by the bookkeeping/dunning/worker-onboarding idempotency-key tests.
- Non-compliant email blocked: `assertSpamActCompliant` (bots 8, 9, 30 evals).
- Global kill switch halts the fleet: enforced in `llm.assertMayRun`.
- `/health` green + monitored; cost logging populates `bot_runs`.

DB-backed integration (hash chain, pgmq durability, approval resume) runs against
real Supabase in CI — PGlite does not bundle pgmq/pgcrypto/vector. The pure
decision logic those flows depend on is unit-tested here, so the
compliance-critical assertions run on every push.
