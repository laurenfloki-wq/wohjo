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

Phase 3 — finance (durable money): **complete**.

| #   | Bot                          | Status                                |
| --- | ---------------------------- | ------------------------------------- |
| 34  | Bookkeeping (Stripe to Xero) | done (durable, idempotent, GST split) |
| 35  | Invoicing                    | done (ABN, no duplicate invoice)      |
| 41  | Usage-metering integrity     | done (mismatch flags, T2)             |
| 36  | Reconciliation               | done (three-way match, T2 on break)   |
| 38  | BAS/GST prep                 | done (G1/1A/1B/7, T2 lodge)           |
| 40  | Financial reporting          | done (P&L, runway; Haiku narrative)   |
| 37  | Dunning                      | done (retry ladder, T2 send)          |
| 39  | R&D tax evidence             | done (eligible spend + evidence, T1)  |

Phase 4 — CRM/data plumbing: **complete**.

| #   | Bot                 | Status                        |
| --- | ------------------- | ----------------------------- |
| 12  | Lead scoring        | done (explainable, T0)        |
| 10  | Lead enrichment     | done (normalise + dedupe, T0) |
| 13  | CRM hygiene         | done (reversible plan, T0)    |
| 11  | ICP list-building   | done (only-new diff, T1)      |
| 16  | Demo scheduling     | done (no double-book, T1)     |
| 17  | Renewal & expansion | done (evidence flags, T2)     |

Phase 5 — engineering (GitHub Actions): **complete**.

| #   | Bot                   | Status                                |
| --- | --------------------- | ------------------------------------- |
| 42  | CI gatekeeper         | done (fleet Ship Gate on PRs)         |
| 45  | Release notes         | done (categorise + emoji-free)        |
| 47  | Uptime/SLO watchdog   | done (burn-rate page/rollback)        |
| 43  | Dependency & security | done (CVSS triage, block fixable)     |
| 44  | Incident triage       | done (priority + grouping; Sonnet PR) |
| 46  | QA/test generation    | done (coverage-gap detect; Sonnet)    |

Remaining phases follow BUILD ORDER:
growth (1-8); sales + lifecycle (9, 14, 15, 18-22); support (23-26);
legal/ops (27-29, 31-33, 52-56, 58).

## Gate tiers

T0 autonomous/reversible; T1 autonomous/notify-after; T2 approve-before (single
director); T3 dual-control. Any message to a customer, lead, or regulator is at
minimum T2 — drafted automatically, never auto-sent.

## Running the gate locally

```
npx tsc --noEmit
npx vitest run platform bots evals
```
