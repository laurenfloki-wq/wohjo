# Test-fixture leak to production — Day 6 forensics ticket

**Opened:** 2026-04-22
**Status:** STUB — to be filled in Day 6 after Tier 1 cleanup completes tonight.
**Owner:** Lauren + Cowork (Day 6)
**Priority:** Required before Monday launch. Non-blocking for Thursday smoke test.

## Purpose

Track the end-to-end investigation of how test-fixture rows landed in
the prod Supabase DB. The Council discovered at least two stale
fixture rows during Day-6 Joao seeding prep (a supervisor with
`+61413573579` and a worker with `+61451258610` pre-existing under
non-FLOSMOSIS parent rows). Tier 1 cleanup tonight soft-deletes the
identified rows; this document captures the post-mortem.

## Day-6 TODOs (to be executed tomorrow)

### 1. Document what was found and remediated

Paste the full Tier 1 #1 sweep result here, by sub-query
(1a–1o), along with the Tier 1 #2 soft-delete block that was
executed against each. Include:
- UUIDs of every row touched
- `updated_at` timestamps post-soft-delete
- SHA-256 of the sweep-result JSON (so later audits can verify the
  record matches the remediated state)

### 2. Root-cause audit of test infrastructure

Audit every location that could have written to prod:

- `src/tests/**` (if present)
- `tests/**` — especially the live-run harnesses at
  `tests/cross-tenant/boundaries.test.ts` (RUN_LIVE_A3=1 gate),
  `src/lib/wles/chain-verify.live.test.ts` (RUN_LIVE_B5=1 gate),
  `scripts/b5-verify-test.ts` (imported `.env.local`).
- `tests/cross-tenant/fixtures.ts` — the Acme/Bravo deterministic-UUID
  builders.
- Any `scripts/**` that accepts a DATABASE_URL.
- Any migration / seed scripts under `migrations/**` or
  `src/db/migrations/**`.

Answer:

- What `DATABASE_URL` does each test/script read?
- Is there a CI workflow that could have leaked (e.g. a GitHub
  Action setting `DATABASE_URL` to prod)?
- When did the leak most likely happen? Use
  `shifts.created_at` / `workers.created_at` on the remediated
  rows to narrow the window.
- Which developer's laptop was the source (compare created_at
  timestamps to git activity on the relevant branches)?

Candidate leak sources (Cowork's own contributions to consider):

| Date | Script | Status | Remediation |
|---|---|---|---|
| 2026-04-21 evening | `scripts/b5-verify-test.ts` — live B5 test | Inserted 3 synthetic `shift_events` rows marked `created_by='B5_HARDENING_TEST'`, then explicitly DELETEd them. Permanent audit row remains in `admin_access_log` (intentional). | If 1j returns `B5_HARDENING_TEST` rows today, the cleanup wasn't complete — investigate |
| 2026-04-22 Day-3 P1 | `migrations/202604220900_create_admins_table.sql` | Schema-only, no seed rows | No data impact |
| 2026-04-22 Day-3 P1 | `migrations/202604220905_workers_user_id.sql` | Schema-only, adds `user_id` column nullable | No data impact |
| pre-Day-1 | Unknown | The two pre-existing rows on +61413573579 and +61451258610 are older than the Cowork sprint itself. Likely a human-run seed pre-Day-1. | Root-cause during Day-6 audit |

### 3. Add CI/test guard

Add a runtime assertion to every test/script that could connect to
a production-shaped DB URL. The guard should:

- Read `DATABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`).
- Match against a deny-list of production hostnames:
  - `rwnxnnudljpgyfwbnosu.supabase.co`
  - `rwnxnnudljpgyfwbnosu.pooler.supabase.com`
  - `aws-1-ap-southeast-2.pooler.supabase.com` (AU pooler)
  - Any URL containing `supabase.co` (conservative default).
- On match: throw before opening the connection. Error message
  must name the guard and cite this ticket.

Shape (to land in `src/lib/testing/prod-guard.ts`):

```ts
export function assertNotProd(url: string): void {
  const PROD_PATTERNS = [
    /rwnxnnudljpgyfwbnosu/,
    /supabase\.co/,
    /\.pooler\.supabase\.com/,
  ];
  for (const re of PROD_PATTERNS) {
    if (re.test(url)) {
      throw new Error(
        `[prod-guard] Refusing to run test/script against what looks like a
         production Supabase URL: ${url}. If this is intentional (e.g. the
         RUN_LIVE_* harnesses) whitelist it via an explicit environment
         override. See security/test-fixture-leak-2026-04-22.md.`,
      );
    }
  }
}
```

Apply at the top of every file under `tests/**` and `scripts/**`
that opens a Supabase connection. The RUN_LIVE_* harnesses get an
explicit opt-in via a second env var (e.g.
`ALLOW_PROD_LIVE_TEST=1`) that is NEVER set in CI.

### 4. Phase-2 schema hardening (roadmap)

Add UNIQUE constraints:

```sql
ALTER TABLE supervisors
  ADD CONSTRAINT supervisors_phone_company_unique
  UNIQUE (phone, company_id);

ALTER TABLE workers
  ADD CONSTRAINT workers_phone_company_unique
  UNIQUE (phone, company_id);
```

Both constraints enforce the business rule "one phone = one
worker/supervisor per company". Would have made tonight's finding
impossible — a second attempt to insert a fixture with the same
phone under the same company_id would have raised SQLSTATE 23505
and the insert would have been rolled back.

Pre-flight for Day 6: query the current state to confirm no existing
rows would violate these constraints. If any do, flag for manual
resolution before applying.

```sql
SELECT phone, company_id, count(*)
FROM workers
WHERE is_active = true
GROUP BY phone, company_id
HAVING count(*) > 1;

SELECT phone, company_id, count(*)
FROM supervisors
WHERE is_active = true
GROUP BY phone, company_id
HAVING count(*) > 1;
```

Zero rows = safe to apply the UNIQUE.

### 5. Close the ticket

Once 1-4 land:
- Move this file from `WOHJO/security/test-fixture-leak-2026-04-22.md`
  (open-ticket) to `WOHJO/security/closed/test-fixture-leak-2026-04-22.md`
  (closed).
- Append a post-mortem table tracking root cause + remediation.
- Update `gate-status-...-end-of-day6.md` with a new "G1 fixture-leak
  prod-guard" valve in GREEN.

---

This is a Day-6 ticket. Tier 1 cleanup tonight is the immediate
action. This document will be filled from the empty stub above
once Lauren has the Tier 1 sweep results + remediation run.
