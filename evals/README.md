# Evals — the CI gate for the fleet

Each bot ships golden cases. The runner (vitest, via the Unit suite workflow)
asserts:

- correct structured output,
- correct gate tier fired,
- no emoji in any output,
- compliance guards enforced (ABN + unsubscribe, Spam Act 2003),
- idempotency on replay (no duplicate side-effect).

A bot is not done until its evals pass.

## Where cases live

Golden cases are co-located with each bot as `*.eval.test.ts` files under
`/bots/<id>/`, plus platform-level pure-logic evals under `/evals/`. They run in
the same vitest invocation as the product's unit suite (`npm test`) and in CI
(`.github/workflows/unit-suite.yml`).

## DB-backed assurance

The hash-chained ledger, pgmq durability, and approval resume run against a real
Postgres (Supabase) in deploy/CI — PGlite does not bundle `pgmq` / `pg_cron` /
`vector` / `pgcrypto`. The pure decision logic those flows depend on (chain
recompute, resume-vs-compensate branching, cost accounting) is unit-tested here
with no infra, so the compliance-critical assertions run on every push.

See `assert.ts` for shared eval helpers.
