// BILL-4 — worker-add chokepoint wiring for the v1.1 plan-ceiling check.
//
// Split from `plan-limits.ts` (pure) the same way `entitlement-guard.ts` is
// split from `entitlement.ts`: the pure evaluation stays unit-testable without
// pulling the Supabase client, and the IO lives here.
//
// NON-BLOCKING by contract — a telemetry failure (or an over-ceiling company)
// must never break worker onboarding. The function returns void and swallows
// its own errors.

import type { Logger } from 'pino';
import { companyRepo } from '@/lib/db/repositories/company.repo';
import { workersRepo } from '@/lib/db/repositories/workers.repo';
import { reportPlanCeiling } from './plan-limits';

/**
 * Evaluate the company's Active-Verified-Worker count against its v1.1 plan
 * ceiling and emit a non-blocking signal when at/over. Call AFTER a successful
 * worker add (single or bulk). Never throws.
 */
export async function enforcePlanCeilingAfterWorkerAdd(
  log: Logger,
  companyId: string,
): Promise<void> {
  try {
    const [tierRes, countRes] = await Promise.all([
      companyRepo(companyId).getPricingTier(),
      workersRepo(companyId).countActive(),
    ]);
    const storedTier =
      (tierRes.data as { pricing_tier?: string | null } | null)?.pricing_tier ?? null;
    reportPlanCeiling(log, {
      companyId,
      storedTier,
      activeWorkerCount: countRes.count ?? 0,
    });
  } catch (err) {
    log.warn(
      { companyId, err: err instanceof Error ? err.message : 'unknown' },
      'billing.plan_ceiling.check_failed',
    );
  }
}
