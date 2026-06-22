# FLOSMOSIS Bot Fleet

Internal automation for FLOSMOSIS PTY LTD, built on a shared deterministic
platform. TypeScript on managed always-on services (Supabase Edge Functions,
pg_cron, pgmq, Vercel, GitHub Actions). No n8n, no Docker, no VPS.

See `AGENTS.md`-adjacent spec for the full mandate. Key cross-cutting docs:
`DECISIONS.md` (assumptions), `SECRETS.md` (env vars), `platform/README.md`.

## Layout

```
/platform   shared library (env, log, db, audit, guard, llm, queue, hitl, obs, connectors)
/bots       one folder per bot (handler + README + *.eval.test.ts)
/supabase   migrations + Edge Functions (Deno)
/evals      platform-level golden cases + shared assert helpers
/.github    fleet-deploy workflow (gate -> deploy)
```

## Build progress

Phase 1 — shared platform + spine: **complete**.

| #   | Bot                                                                    | Status |
| --- | ---------------------------------------------------------------------- | ------ |
| —   | Shared platform (env/log/db/audit/guard/llm/queue/hitl/obs/connectors) | done   |
| —   | Data model migration (`0001_bot_platform_core.sql`)                    | done   |
| —   | `/health` Edge Function + deploy workflow + eval harness               | done   |
| 30  | Compliance guard                                                       | done   |
| 6   | Brand-voice guardian                                                   | done   |
| 57  | Approval router                                                        | done   |

Remaining phases follow BUILD ORDER: finance (34, 35, 36, 41, 38, 40, 37, 39);
CRM (10, 11, 12, 13, 16, 17); engineering (42, 43, 45, 47, 44, 46); growth
(1-8); sales + lifecycle (9, 14, 15, 18-22); support (23-26); legal/ops
(27-29, 31-33, 52-56, 58).

## Gate tiers

T0 autonomous/reversible; T1 autonomous/notify-after; T2 approve-before (single
director); T3 dual-control. Any message to a customer, lead, or regulator is at
minimum T2 — drafted automatically, never auto-sent.

## Running the gate locally

```
npx tsc --noEmit
npx vitest run platform bots evals
```
