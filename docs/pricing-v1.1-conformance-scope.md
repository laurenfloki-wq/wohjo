# Pricing Specification v1.1 — system conformance scope

**Status:** scoping only. Not started. Blocked on open director decisions A–D
(below) and on Stripe/contract setup, which are business-owner tasks.

**Why this doc exists:** v1.1 changes the *shape* of the pricing model, not just
its numbers. BILL-4 ([plan-limits.ts](../src/lib/billing/plan-limits.ts)) already
enforces v1.1's worker **ceilings** as a non-blocking signal, but it is
deliberately decoupled from the billing source of truth. "Full conformance" —
making the system actually price, provision, and bill under v1.1 — is the larger
piece scoped here.

---

## 1. The model (v1.1)

Two-part tariff: **platform base + marginal per Active Verified Worker**, billed
only on workers *above* the included count, capped at the tier ceiling.

| Tier | Base/mo | Included | Per extra worker/mo | Ceiling | Onboarding | Min term |
|---|---|---|---|---|---|---|
| Starter | A$99 | 10 | A$5 (workers 11–25) | 25 | none | 3 mo |
| Growth | A$299 | 40 | A$4 (workers 41–120) | 120 | A$1,500 | 12 mo |
| Enterprise | from A$1,000 | priced from worker 1 | A$3.25 (1–400), A$3.00 (401+) marginal | none (negotiated) | A$5,000–15,000 | 12 mo |

**Bill formulas** (reproduce the worked table exactly):

```
Starter(n)    = 99  + 5    × max(0, min(n, 25)  − 10)
Growth(n)     = 299 + 4    × max(0, min(n, 120) − 40)
Enterprise(n) = 1000 + 3.25 × min(n, 400) + 3.00 × max(0, n − 400)
```

Verified against the spec's illustrative bills: 25→174, 26→299, 75→439,
120→619, 121→1,393, 220→1,715, 400→2,300, 600→2,900. ✔

**Active Verified Worker** = the unit of billing. Today the closest definition is
`workers.is_active = true` per company (there is no separate "verified" flag).
Confirm whether "verified" adds a condition (e.g. has completed ≥1 sealed shift)
before billing on it — see Decision E (raised below).

---

## 2. Open director decisions (hard blockers)

These are flagged "open" in the spec; nothing should hardcode them as final.

| # | Decision | Blocks |
|---|---|---|
| **A** | Growth→Enterprise transition at 120/121 workers (the 619→1,393 step) | the ceiling-crossing behaviour; whether 121 auto-prices Enterprise or routes to sales |
| **B** | Held Starter floor (A$99 incl. 10) | the Starter base/included constants |
| **C** | GST treatment (inclusive vs +10% on top) | every displayed and charged price; Stripe tax config |
| **D** | Annual-prepay rate | whether a yearly cadence exists at all and its discount |
| **E** *(raised here)* | Does "Active **Verified** Worker" differ from `is_active`? | the count that drives both billing and the BILL-4 ceiling check |

Until A–E land, conformance can be *built behind a flag* but not switched on.

---

## 3. Current state → target state

### 3a. Code — `src/lib/stripe/pricing.ts`
- **Now:** flat-price tiers `founding | standard | growth | scale | enterprise`,
  each a single monthly price, with `max_workers` + `max_shifts_30d` caps and a
  `resolveTierFromUsage()` MAX rule (the old auto-upgrade model).
- **Target:** two-part-tariff tiers `starter | growth | enterprise`, with
  `base_cents`, `included_workers`, marginal `per_worker_cents` band(s),
  `ceiling`, plus a `computeMonthlyBill(tier, activeWorkers)` engine matching §1.
  v1.1 has **no shift-volume axis** — drop `max_shifts_30d` from the pricing
  concern entirely (BILL-4 already treats the shift-commit cap as moot).
- Keep `founding` as a legacy/grandfathered value (existing contracts);
  `scale` retires (fold into Growth/Enterprise per the migration map in 3b).

### 3b. Database — `companies.pricing_tier`
- **Now:** live CHECK allows `founding | standard | growth | scale | enterprise`
  ([widen migration](../migrations/20260615053603_widen_companies_pricing_tier_to_five_tiers.sql)).
  Live data: 1 company, `pricing_tier = NULL` (pre-launch).
- **Target:** widen the CHECK to add `starter`; decide the disposition of the
  legacy values. Proposed map (needs sign-off): `standard → starter`,
  `scale → growth or enterprise` (by worker count), `founding` retained.
  A data migration retiers existing rows — trivial today (1 NULL row), but write
  it now so it's correct when customers exist.
- `provision_tenant_from_checkout` RPC validates `p_pricing_tier` against the old
  set in several migrations — update its allow-list in lockstep.

### 3c. Stripe (business-owner — Lauren)
- New Price objects per tier: a recurring **base** price + a **metered/graduated**
  per-worker price (Stripe graduated tiers model the included-count + marginal
  bands directly). Lookup keys: `starter-base`, `starter-worker`, `growth-base`,
  `growth-worker`, `enterprise-base`, `enterprise-worker-tier1/2`.
- Usage reporting: report Active-Verified-Worker count to the metered price
  (monthly, or on change). Decide GST (Decision C) in Stripe Tax.
- The webhook handlers ([webhook-handlers.ts](../src/lib/stripe/webhook-handlers.ts))
  + checkout ([checkout/route.ts](../src/app/api/stripe/checkout/route.ts)) must
  map the new lookup keys → `pricing_tier`.

### 3d. Contracts
- Order Form fixes Tier, counts, and negotiated Enterprise terms (per the
  schedule). Template parameters need the v1.1 base/included/marginal/ceiling
  fields. Business-owner task.

---

## 4. Blast radius (code consumers of the current model)

- `src/lib/stripe/pricing.ts` — the model itself.
- `src/lib/stripe/webhook-handlers.ts` — writes `pricing_tier` from Stripe events.
- `src/app/api/stripe/checkout/route.ts` — tier selection at checkout.
- `src/db/schema.ts` — the `pricing_tier` column type.
- `migrations/*provision*`, `*pricing_tier*` — the RPC allow-list + CHECK.
- `src/lib/billing/plan-limits.ts` (BILL-4) — already v1.1-aware; once the DB
  carries `starter`, extend `v1CeilingForStoredTier` to map it directly (today
  it maps the legacy `standard → 25`).

---

## 5. Proposed sequence (once A–E are decided)

1. Land A–E as constants in one reviewed block in `pricing.ts` (no magic numbers).
2. `computeMonthlyBill()` + unit tests pinned to the §1 worked table.
3. DB: widen `pricing_tier` CHECK (+`starter`), update `provision_tenant`
   allow-list, write the retier data-migration. Refresh drift refs
   (functions/defaults) from the attestation artifact.
4. Stripe Price objects + lookup-key mapping (Lauren) → wire checkout + webhooks.
5. Flip behind a `PRICING_V1_1_ENABLED` flag; BILL-4 ceiling check switches from
   the legacy-tier map to the native `starter/growth/enterprise` ceilings.
6. Backfill/retier existing customers (1 today) and confirm Stripe usage
   reporting end-to-end on a test subscription before go-live.

---

## 6. Risks

- **Hardcoding an open decision.** A–E are explicitly unresolved; building final
  constants now risks a rebuild. Mitigation: one labelled `PENDING_DIRECTOR_*`
  block, flag-gated.
- **Customer-facing billing.** Pricing changes touch live charging. Mitigation:
  flag + test subscription + the 1-customer pre-launch window makes this the
  cheapest possible moment to land it.
- **GST (C).** Inclusive-vs-additive changes every number a customer sees and is
  charged; resolve before any price is published.
