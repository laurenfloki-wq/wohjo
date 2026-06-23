// FLOSTRUCTION canonical payroll categories.
//
// Every shift's hours land in exactly one of these eight buckets. The
// per-worker `workers.activity_mappings` jsonb maps each bucket to the
// payroll provider's Activity ID for that worker (MYOB today, others
// later). This is the single source of truth for the category set —
// the worker-profile editor, the PATCH validation, and any future
// provider exporter all read from here so the list can never drift.

export const CANONICAL_CATEGORIES = [
  'ordinary_hours',
  'overtime_1_5x',
  'overtime_2x',
  'rdo_deductions_cw2',
  'travel_allowance',
  'meal_allowance',
  'inclement_weather_cw2',
  'multi_storey_allowance',
] as const;

export type CanonicalCategory = (typeof CANONICAL_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(CANONICAL_CATEGORIES);

/** True for the eight known FLOSTRUCTION categories. */
export function isCanonicalCategory(value: string): value is CanonicalCategory {
  return CATEGORY_SET.has(value);
}

/** Human label for a category key, e.g. ordinary_hours → "Ordinary hours",
 *  inclement_weather_cw2 → "Inclement weather (CW2)". */
export function categoryLabel(category: string): string {
  const withCw2 = category.replace(/_cw2$/i, '');
  const words = withCw2.replace(/_/g, ' ').trim();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);
  const pretty = sentence
    .replace(/\b1 5x\b/i, '1.5×')
    .replace(/\b2x\b/i, '2×')
    .replace(/\brdo\b/i, 'RDO');
  return /_cw2$/i.test(category) ? `${pretty} (CW2)` : pretty;
}
