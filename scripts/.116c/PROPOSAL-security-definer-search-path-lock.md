# PROPOSAL — SECURITY DEFINER search_path lock

**Status:** DRAFT — not for #47.
**Owner:** to be picked up after #47 merges.

## Problem

chat-Claude's 2026-06-09 attestation observed that the 5 SECURITY
DEFINER functions in `public` schema currently run with
`search_path = 'public'` or `'public, extensions'` rather than a
locked empty path. Production carries them in this form today and the
substrate PR (#47) reproduces them faithfully — but the form itself is
a defence-in-depth gap: a SECURITY DEFINER function with a mutable
search_path can be subverted by an attacker who can create objects
in the search_path order to shadow built-ins.

Affected functions:

- `bulk_create_workers(p_company_id uuid, p_admin_user_id uuid, p_workers jsonb)`
- `export_finalise(p_company_id uuid, p_admin_user_id uuid, p_idempotency_key text, p_shift_ids uuid[], p_chain_tail_at_seal text, p_pack_data jsonb, p_export_data jsonb, p_events jsonb)`
- `process_flostruction_export(p_company_id uuid, p_admin_user_id uuid, p_shift_ids uuid[], p_file_hash text)`
- `provision_tenant_from_checkout(p_stripe_customer_id text, p_stripe_subscription_id text, p_email text, p_company_name text, p_abn_digits text, p_pricing_tier text, p_signup_metadata jsonb, p_admin_user_id uuid)`
- `count_broken_chain_links()` — once chat-Claude confirms its
  production attributes (PR #47 DECISION NEEDED #3)

The same Postgres advisor (0011) flagged the trigger function
`set_worker_disputes_updated_at` for this in 2026-05; that one was
locked via `crack_210` to `SET search_path = ''`. The hardening here
follows the same pattern.

## Proposed approach

A single forward migration `2026MMDDhhmm_security_definer_search_path_lock.sql`
that:

1. For each SECURITY DEFINER function, runs `ALTER FUNCTION ... SET
search_path TO ''` (the most defensive option — the function then
   relies on fully-qualified references for everything outside
   `pg_catalog`, which is always implicitly available).
2. Audits each function body for unqualified references to objects
   outside `pg_catalog` (e.g., `now()` is fine — pg_catalog; but
   `workers` is unqualified — needs `public.workers`). Body edits
   only where required.
3. Surfaces the audit findings in the migration's header so the
   change is reviewable.

## Why NOT in #47

The dispatch is explicit: "**Faithful reproduction**: match current
production exactly, warts included; never improve in genesis;
**cleanups are separate forward migrations, surfaced.**" #47's job is
to reproduce live prod byte-for-byte. Locking the search_path is a
change, not a reproduction. It belongs in a follow-up.

## Sequencing

1. #47 merges with faithful reproduction (rebuild ≡ live prod).
2. Drift gate provisioned and green.
3. This proposal becomes a PR — `chore(security): lock SECURITY
DEFINER search_paths`.
4. Migration applies cleanly to prod (no-op for `count_broken_chain_links`
   if it's already locked; otherwise the ALTER changes behaviour).
5. The PR's bulletproof + full-graph CI confirm no regressions; new
   prod fingerprints are committed as the new baseline references.
6. Drift gate's hourly run confirms live prod converges.

## Out of scope

- Body rewrites beyond what the search_path lock requires.
- INVOKER vs DEFINER decisions for any function — these are
  per-function judgement calls about who the function should run as.
- Adding new SECURITY DEFINER functions.
