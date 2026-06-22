# FLOSMOSIS Bot Fleet — shared platform

The deterministic spine every bot is built on. Runtime-agnostic TypeScript
(Node + Deno), web-standard APIs, no framework that hides prompts or control flow.

## Modules

| Module        | Purpose                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `env.ts`      | Typed env access; never throws at import (safe cold starts). `requireEnv` only at point of use.                                    |
| `log.ts`      | Pino structured logging with secret redaction. No `console.*` in business logic.                                                   |
| `db.ts`       | postgres.js client (lazy, serverless-friendly). Edge Functions use supabase-js instead.                                            |
| `audit.ts`    | `record()` appends a hash-chained ledger row (chain computed in the DB trigger); `verifyChain()` validates end to end.             |
| `guard.ts`    | Deterministic compliance: `assertSpamActCompliant` (ABN + unsubscribe), `assertNoEmoji`, `assertGrounded`. NEVER an LLM.           |
| `llm.ts`      | Single Claude client. Model routing by task class, prompt caching, kill switch + per-bot budget, cost logging, strict-JSON helper. |
| `queue.ts`    | pgmq wrappers (`enqueue`, `drain`, `claimIdempotency`). Handlers idempotent via claim-once.                                        |
| `hitl.ts`     | Approval gates: `requestApproval`, `resolveApproval`, `sweepExpired`. Parks/resumes durable flows.                                 |
| `obs.ts`      | Health, per-bot + fleet cost views.                                                                                                |
| `connectors/` | Typed wrappers per provider, each with its own scoped credential.                                                                  |

## Model tiering

- Haiku (`claude-haiku-4-5-20251001`): classify, extract, route, tag, summary.
- Sonnet (`claude-sonnet-4-6`): draft, reason, redline, answer.

Default to no LLM. Prompt caching on stable system + retrieved context. Per-bot
monthly budget; breach pauses the bot and raises a T1 notice. Global kill switch
(`bot_config` row `__global__`) halts the fleet.

## Data model

See `supabase/migrations/0001_bot_platform_core.sql`: `bot_audit_ledger`
(append-only, hash-chained), `bot_config` (enable + budget + kill switch),
`bot_runs` (token + AUD cost), `bot_idempotency_keys`, `bot_approval_requests`,
`bot_kb_chunks` (pgvector).

## Expected monthly cost

Platform infra: 0 AUD (Supabase free/Pro, Vercel Hobby, GitHub Actions). The
only variable cost is LLM inference, attributed per bot in `bot_runs`.
