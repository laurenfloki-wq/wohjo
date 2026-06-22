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

From the Supabase dashboard for `flosmosis-fleet`:

- `SUPABASE_URL` = `https://bxrmraxnihrbhhwfjrga.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = Project Settings -> API -> `service_role` secret
- `FLEET_DATABASE_URL` = Project Settings -> Database -> Connection string
  (Transaction pooler, port 6543). Reset the DB password there if you did not
  record it. **Do NOT reuse the product's `DATABASE_URL`** — the fleet has its
  own database; `DATABASE_URL` must keep pointing at the product DB.

Self-issued (generate, e.g. `openssl rand -hex 32`):

- `CRON_SECRET`
- `FLEET_RUN_SECRET`

Fleet config:

- `ANTHROPIC_API_KEY` (your Claude key)
- `FLOSMOSIS_ABN` (the real ABN)
- `FLOSMOSIS_UNSUBSCRIBE_BASE_URL`

Connector tokens — add only as you switch each bot on (see `SECRETS.md`):
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `XERO_ACCESS_TOKEN`,
`XERO_TENANT_ID`, `HUBSPOT_PRIVATE_APP_TOKEN`, `GITHUB_FLEET_TOKEN`, etc.

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

## Notes

- Scheduled bots whose connector/secret is not yet set return an audited
  `awaiting_input` and keep firing; they go live the moment the connector is set.
- Nothing customer/lead/regulator-facing auto-sends: those land in
  `bot_approval_requests` for a director at `/fleet/approvals`.
