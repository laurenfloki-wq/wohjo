# Fleet go-live runbook

The dedicated Supabase project is created and migrated. Remaining steps are
yours (secrets) plus one post-deploy SQL call.

## Supabase project (created)

- Name: `flosmosis-fleet`
- Ref: `bxrmraxnihrbhhwfjrga`
- Region: `ap-southeast-2` (Sydney)
- URL: `https://bxrmraxnihrbhhwfjrga.supabase.co`
- Cost: $0/month (free tier)
- Applied: `0001_bot_platform_core` (tables + hash-chain + kill switch),
  `0002_fleet_cron` (`fleet_register_cron`), `0003_fleet_rls` (deny-by-default
  RLS + `bookkeeping` pgmq queue). Advisors clean (the `rls_enabled_no_policy`
  INFOs are intentional — the fleet uses the service role, which bypasses RLS).

## 1. Set Vercel env vars (Production)

The product (FLOSTRUCTION) already runs in this Vercel project, so several vars
exist. The fleet shares only the two it is meant to share and adds its own.

**Already present — reuse as-is, do NOT change:**

- `CRON_SECRET` — the fleet run/worker routes reuse it; Vercel Cron sends it
  automatically. (Reveal its value in Vercel to pass to `fleet_register_cron`.)
- `DATABASE_URL` — the **product** database. The fleet reads it READ-ONLY for
  DB-sourced self-feeds (`platform/product-db.ts`). It MUST keep pointing at the
  product DB. Do not repoint it.

**Add — fleet only (5 vars):**

- `FLEET_DATABASE_URL` = `flosmosis-fleet` -> Project Settings -> Database ->
  Connection string (Transaction pooler, port 6543). The fleet's OWN database.
  Reset the DB password there if you did not record it. This is the only DB var
  that isolates the fleet from the product — there is no fallback to `DATABASE_URL`.
- `FLEET_RUN_SECRET` = self-issued (`openssl rand -hex 32`). Gates on-demand bot
  invokes, status and approval resolution (`x-fleet-secret`). Absent = those
  routes 401.
- `ANTHROPIC_API_KEY` = your Claude key (the fleet LLM client).
- `FLOSMOSIS_ABN` = the real ABN. Outbound-email guard is **fail-closed**: absent
  = all customer/lead email is blocked.
- `FLOSMOSIS_UNSUBSCRIBE_BASE_URL` = e.g. `https://flosmosis.com/unsubscribe`
  (also fail-closed for outbound email).

**Do NOT set for the fleet:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. These
belong to the product and point at the product Supabase. The fleet's Vercel
runtime never reads them (it talks to its DB purely via `FLEET_DATABASE_URL`).
The only fleet code that uses them is the Supabase **health Edge Function**, which
Supabase injects automatically into the function at runtime — nothing to set in
Vercel.

**Connector tokens — add only as you switch each bot on** (see `SECRETS.md`):
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `XERO_ACCESS_TOKEN`,
`XERO_TENANT_ID`, `HUBSPOT_PRIVATE_APP_TOKEN`, `GITHUB_FLEET_TOKEN`.

## 2. Deploy

Merge this PR (or deploy the branch). Vercel builds the app + the fleet routes.

## 3. Register the schedules (once, after deploy)

In the Supabase SQL editor for `flosmosis-fleet`, with your real app domain and
the `CRON_SECRET` you set in Vercel:

```sql
select fleet_register_cron('https://<your-app-domain>', '<CRON_SECRET>');
```

Returns the number of jobs registered (24: 23 scheduled bots + the per-minute
worker). Re-run any time to refresh.

## 4. Verify

- `GET https://<app>/api/cron/... ` style health: hit `/api/fleet/run/57-approval-router`
  with `Authorization: Bearer <CRON_SECRET>` -> expects an expiry-sweep result.
- Manual bot: `POST /api/fleet/run/15-proposal-quote` with header
  `x-fleet-secret: <FLEET_RUN_SECRET>` and body `{"tier":"growth","activeWorkers":60}`.
- Approvals: open `/fleet/approvals`.
- Kill switch: `update bot_config set enabled=false where bot_id='__global__';`
  halts the fleet (LLM + every run).

## Dedicated subdomain (ops.flosmosis.com)

The fleet pages live in the product app but are isolated to their own subdomain
so they never appear alongside the marketing site.

1. **Vercel:** project `wohjo` -> Settings -> Domains -> add `ops.flosmosis.com`.
2. **DNS:** at the `flosmosis.com` registrar, add the CNAME Vercel shows
   (`ops` -> `cname.vercel-dns.com`). Wait for "Valid Configuration".
3. **Env:** set `FLEET_OPS_HOST=ops.flosmosis.com` in Vercel (Production).
4. Redeploy.

Result: `https://ops.flosmosis.com/` -> the fleet dashboard (director login
required); `https://<marketing-domain>/fleet` -> 404. The `/api/fleet/*` routes
stay reachable on any host (secret-gated), so you can point
`fleet_register_cron` at either the ops host or the main app URL.

## Notes

- Scheduled bots whose connector/secret is not yet set return an audited
  `awaiting_input` and keep firing; they go live the moment the connector is set.
- Nothing customer/lead/regulator-facing auto-sends: those land in
  `bot_approval_requests` for a director at `/fleet/approvals`.
