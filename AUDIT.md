# FLOSMOSIS Bot Fleet — Automation Audit & Optimisation

Reviewer lens: 20+ years building AU Pty Ltd automation, SaaS growth/retention, and
senior B2B sales. Scope: all 54 bots as built. Verdict: the **engineering spine is
excellent** (deterministic, idempotent, gated, audited, observable). The **decision
logic is MVP-grade** — correct but generic. To be best-in-class for FLOSMOSIS it must
be calibrated to this business: construction labour-hire, the WLES sealed clock-on as
the core value event, **active workers** as the metered unit, and AU labour-hire
licensing as the sharpest ICP signal.

## Systemic findings (apply to most bots)

1. **Magic numbers, uncalibrated.** Thresholds (lead points, churn weights, dunning
   delays, SEO limits, NPS bands) were scattered in code and generic. A growth team
   must tune these without a deploy. **Fix:** one documented, FLOSMOSIS-calibrated
   config (`bots/config.ts`); no business threshold lives in handler code.
2. **Not grounded in the product's actual value event.** Retention/expansion logic
   ignored the one signal that matters here: **days since last sealed clock-on**.
   Worker counts and Stripe events are lagging; sealed-clock-on recency is leading.
3. **The unique sales assets weren't exploited.** FLOSMOSIS's edge is (a) the licence
   registers (a clean, intent-rich ICP list) and (b) the WLES evidentiary
   differentiator (wage-theft / Fair Work / court-admissible proof). Lead scoring,
   ICP, and outreach should weight licence-state and evidentiary engagement.
4. **Bands not tied to economics.** Lead/churn/NPS cutoffs should map to actions and
   to the pricing tiers (Starter/Growth/Scale at 10/50/200 included workers), not to
   round numbers.

## Per-bot grades (pre-optimisation) and the headline fix

Growth/retention engine (highest ROI — optimised first):

| Bot                    | Grade | Headline fix                                                                                                                                  |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 12 Lead scoring        | C+    | Calibrate to AU construction labour-hire ICP: mandatory-licence states, worker-tier = pricing tier, evidentiary-intent signals, action bands. |
| 21 Churn-risk          | C     | Lead with sealed-clock-on recency; add onboarding-incomplete + support-friction; weight to the metered unit.                                  |
| 17 Renewal/expansion   | C+    | Expansion = per-active-worker growth tiers (the revenue lever); flag at-risk renewals (renewal soon + activity decay).                        |
| 11 ICP list-building   | B-    | Prioritise mandatory-licence jurisdictions (VIC/QLD/SA/ACT); score, not just diff.                                                            |
| 14 Reply qualification | C+    | Construction-context intents; buying-signal detection; SDR-grade routing.                                                                     |
| 25 Ticket triage       | B-    | Wage/payroll/clock-on outage = P1; route by the real product surfaces.                                                                        |
| 37 Dunning             | B-    | B2B AU cadence; SMS leverages the workforce channel; escalate to a human before churn.                                                        |
| 22 Feedback/NPS        | B     | Bands tied to action (promoter -> referral/case-study ask; detractor -> save play).                                                           |

The remaining bots (finance, support, growth, legal, ops) are graded B/B+ on
engineering and get config-calibration + targeted logic upgrades in later waves
(see "Optimisation waves").

## Optimisation waves

- **Wave 1 (this pass): the revenue + retention engine** — `bots/config.ts` +
  bots 12, 21, 17, 11, 14, 25 rewritten to FLOSMOSIS-bespoke logic with expanded
  golden evals.
- **Wave 2: monetisation & cash** — 15 pricing/quote (tier guidance + expansion
  upsell), 37 dunning, 41 metering (active-worker truth), 17 expansion playbooks.
- **Wave 3: support & success grounded in WLES** — 23/26 (answer strictly from
  sealed records; confidence calibration), 25 triage SLAs.
- **Wave 4: growth & content** — 1/2/3/7/8 calibrated to the evidentiary narrative.
- **Wave 5: legal/compliance/ops** — 27-33 playbooks, 52 daily brief weighting.

Every change keeps the deterministic-spine + gates + audit + idempotency intact;
optimisation is in the decision quality, not the safety model.
