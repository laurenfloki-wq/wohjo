// Bot 39 — R&D tax evidence.
//
// Trigger: weekly | Runtime: pg_cron->EF | Gate: T1 | Model: Haiku (categorise
// edge cases). Tags eligible engineering spend for the RDTI (R&D Tax Incentive)
// and links it to commit evidence. The eligibility rule is deterministic; only
// genuinely ambiguous items would go to Haiku. Sums are exact.

export const BOT_ID = 'bot-39-rd-tax-evidence';

// RDTI eligibility leans on experimental/development activity. We tag spend
// whose activity category is in the eligible set and that has commit evidence.
export type ActivityCategory =
  | 'experimental_development'
  | 'core_rd'
  | 'supporting_rd'
  | 'bau_maintenance'
  | 'sales'
  | 'admin';

const ELIGIBLE: ReadonlySet<ActivityCategory> = new Set([
  'experimental_development',
  'core_rd',
  'supporting_rd',
]);

export interface SpendItem {
  id: string;
  category: ActivityCategory;
  amountCents: number;
  commitShas: string[];
}

export interface RdEvidence {
  eligible: SpendItem[];
  ineligible: SpendItem[];
  totalEligibleCents: number;
}

/**
 * Pure: partition spend into eligible/ineligible and sum the eligible total.
 * An item is eligible only if its category is in the RDTI-eligible set AND it
 * carries commit evidence (no evidence, no claim).
 */
export function tagEligibleSpend(items: ReadonlyArray<SpendItem>): RdEvidence {
  const eligible: SpendItem[] = [];
  const ineligible: SpendItem[] = [];
  for (const it of items) {
    if (ELIGIBLE.has(it.category) && it.commitShas.length > 0) {
      eligible.push(it);
    } else {
      ineligible.push(it);
    }
  }
  const totalEligibleCents = eligible.reduce((sum, it) => sum + it.amountCents, 0);
  return { eligible, ineligible, totalEligibleCents };
}
