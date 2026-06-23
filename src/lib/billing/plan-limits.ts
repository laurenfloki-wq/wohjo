// BILL-4 (launch-readiness audit) — v1.1 plan-ceiling enforcement.
//
// Pricing Specification v1.1 is a two-part tariff (platform base + per Active
// Verified Worker) with a per-tier worker CEILING:
//
//   Starter     ceiling 25
//   Growth      ceiling 120
//   Enterprise  no ceiling (negotiated)
//
// v1.1 dropped the old shift-volume axis entirely, so enforcement is
// worker-count-only — the audit's "shift-commit cap" half is moot under v1.1.
//
// SCOPE: this module is the ENFORCEMENT surface only. It is deliberately
// decoupled from `@/lib/stripe/pricing.ts` (the legacy flat-tier model) and
// is NOT the billing source of truth. Full v1.1 conformance — rewriting
// pricing.ts to the two-part tariff, widening the companies.pricing_tier enum,
// retiering customers, and minting Stripe price objects — is a separate task
// gated on the open director decisions (A: Growth→Enterprise at 120/121,
// B: Starter floor, C: GST, D: annual-prepay).
//
// POLICY: NON-BLOCKING. v1.1 ceilings are tier-TRANSITION points, not hard
// stops (the worked bills auto-transition: 26→Growth, 121→Enterprise). So a
// worker-add that reaches/exceeds the ceiling still proceeds; we emit a
// structured signal so the over-ceiling company is surfaced for the
// upgrade/sales path. Flip `BILL4_HARD_BLOCK` reasoning here if a hard 4xx
// block is ever chosen (a business-policy decision, not made here).

import type { Logger } from 'pino';

export type PlanTierV1 = 'starter' | 'growth' | 'enterprise';

/** v1.1 per-tier Active-Verified-Worker ceiling. null = unbounded. */
export const PLAN_CEILINGS_V1: Record<PlanTierV1, number | null> = {
  starter: 25,
  growth: 120,
  enterprise: null,
};

/**
 * Map the stored `companies.pricing_tier` (legacy enum:
 * founding|standard|growth|scale|enterprise|null) onto a v1.1 worker ceiling.
 *
 * Only 'standard' (the v1 precursor of Starter) and 'growth' carry a finite
 * ceiling. 'founding' is contractually exempt; 'scale'/'enterprise' sit above
 * Growth (negotiated, unbounded); NULL is a not-yet-provisioned company. All
 * of those return null → no enforcement signal.
 */
export function v1CeilingForStoredTier(storedTier: string | null | undefined): number | null {
  switch (storedTier) {
    case 'standard':
      return PLAN_CEILINGS_V1.starter; // 25
    case 'growth':
      return PLAN_CEILINGS_V1.growth; // 120
    default:
      // founding | scale | enterprise | null | undefined | unknown → unbounded
      return null;
  }
}

export interface PlanCeilingEvaluation {
  /** v1.1 ceiling for the company's tier; null when unbounded/unenforced. */
  ceiling: number | null;
  activeWorkerCount: number;
  /** True when the count has reached or passed a finite ceiling. */
  atOrOver: boolean;
  /** ceiling − count; null when unbounded. Negative when over. */
  headroom: number | null;
}

export function evaluatePlanCeiling(input: {
  storedTier: string | null | undefined;
  activeWorkerCount: number;
}): PlanCeilingEvaluation {
  const ceiling = v1CeilingForStoredTier(input.storedTier);
  if (ceiling == null) {
    return {
      ceiling: null,
      activeWorkerCount: input.activeWorkerCount,
      atOrOver: false,
      headroom: null,
    };
  }
  return {
    ceiling,
    activeWorkerCount: input.activeWorkerCount,
    atOrOver: input.activeWorkerCount >= ceiling,
    headroom: ceiling - input.activeWorkerCount,
  };
}

/**
 * BILL-4 chokepoint hook. Evaluates the company's active-worker count against
 * its v1.1 ceiling and, when at/over, emits a NON-BLOCKING structured signal.
 * Returns the evaluation so a caller could surface headroom in a response, but
 * never throws and never blocks — telemetry must not break a worker-add.
 */
export function reportPlanCeiling(
  log: Logger,
  ctx: { companyId: string; storedTier: string | null | undefined; activeWorkerCount: number },
): PlanCeilingEvaluation {
  const ev = evaluatePlanCeiling({
    storedTier: ctx.storedTier,
    activeWorkerCount: ctx.activeWorkerCount,
  });
  if (ev.atOrOver) {
    log.warn(
      {
        companyId: ctx.companyId,
        storedTier: ctx.storedTier ?? null,
        ceiling: ev.ceiling,
        activeWorkerCount: ev.activeWorkerCount,
        overBy: ev.headroom == null ? 0 : Math.max(0, -ev.headroom),
      },
      'billing.plan_ceiling.exceeded',
    );
  }
  return ev;
}
