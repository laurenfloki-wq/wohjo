// Onboarding state machine — drives the self-service signup wizard.
// Each step has a stable id, a human label, an order index, and a
// guard that decides whether the user is allowed to enter the step
// given the current company row.
//
// The wizard reads `companies.signup_step` to determine where the
// user is, and `signup_completed_at` to know if they are done.
//
// Save-and-resume:
//   - On each successful step submission the API advances
//     `signup_step` to the next id.
//   - On signing-in mid-flow, the user is redirected to /onboarding
//     which reads `signup_step` and renders the appropriate step.
//
// The terminal step `done` redirects to /command on next mount.

export type SignupStep =
  | 'account'
  | 'company'
  | 'terms'
  | 'billing'
  | 'site'
  | 'supervisor'
  | 'workers'
  | 'done';

export interface StepDefinition {
  id: SignupStep;
  index: number;       // 1-based for the progress UI
  label: string;       // shown in the progress header
  description: string; // one-line subhead
  isRequired: boolean; // false steps are skippable
}

export const STEPS: readonly StepDefinition[] = [
  { id: 'account',     index: 1, label: 'Your account',
    description: 'Email + password. We use email — never SMS — for command users.',
    isRequired: true },
  { id: 'company',     index: 2, label: 'Your company',
    description: 'Legal name, ABN, signing authority, billing contact.',
    isRequired: true },
  { id: 'terms',       index: 3, label: 'Terms & founding cohort',
    description: 'Founding pricing locks in for the first 20 customers.',
    isRequired: true },
  { id: 'billing',     index: 4, label: 'Payment method',
    description: '60-day free trial. Card captured but not charged until day 61.',
    isRequired: true },
  { id: 'site',        index: 5, label: 'Your first site',
    description: 'Address + geofence. Workers clock in here.',
    isRequired: true },
  { id: 'supervisor',  index: 6, label: 'Invite a supervisor',
    description: 'Who approves shifts? They get an email invite.',
    isRequired: true },
  { id: 'workers',     index: 7, label: 'Invite your first workers',
    description: 'Phone numbers only. They get an SMS invite.',
    isRequired: false }, // skippable — founder can do this from /command later
  { id: 'done',        index: 8, label: "You're set up",
    description: 'Ready to verify hours.',
    isRequired: false },
] as const;

export const TOTAL_STEPS = STEPS.filter((s) => s.id !== 'done').length;

export function stepByIndex(idx: number): StepDefinition | undefined {
  return STEPS.find((s) => s.index === idx);
}

export function stepById(id: SignupStep): StepDefinition | undefined {
  return STEPS.find((s) => s.id === id);
}

export function nextStep(current: SignupStep): SignupStep {
  const i = STEPS.findIndex((s) => s.id === current);
  if (i < 0 || i >= STEPS.length - 1) return 'done';
  return STEPS[i + 1].id;
}

/**
 * Whether a user can enter this step given the company row state.
 * The wizard uses this to redirect users who manually navigate to a
 * step they haven't reached yet.
 */
export function canEnterStep(
  step: SignupStep,
  company: {
    name?: string | null;
    abn_digits?: string | null;
    accepted_terms_at?: Date | string | null;
    stripe_customer_id?: string | null;
    signup_step?: SignupStep | null;
  } | null,
): boolean {
  if (!company) return step === 'account';
  switch (step) {
    case 'account':    return true;
    case 'company':    return true; // requires authenticated user only
    case 'terms':      return Boolean(company.name && company.abn_digits);
    case 'billing':    return Boolean(company.accepted_terms_at);
    case 'site':       return Boolean(company.stripe_customer_id);
    case 'supervisor': return company.signup_step === 'supervisor' ||
                              company.signup_step === 'workers' ||
                              company.signup_step === 'done';
    case 'workers':    return company.signup_step === 'workers' ||
                              company.signup_step === 'done';
    case 'done':       return Boolean(company.signup_step === 'done');
  }
}

/**
 * Pricing tier assignment rule. Called when allocating the founding
 * cohort position via the DB allocator. If the allocator returns a
 * position 1..20, the company is `founding`; otherwise `standard`.
 */
export function pricingTierForCohortPosition(
  position: number | null,
): 'founding' | 'standard' {
  return position !== null && position >= 1 && position <= 20
    ? 'founding'
    : 'standard';
}

/**
 * Standard trial duration — 30 days. Industry-standard B2B SaaS trial.
 * Per founder decision-batch 2026-04-25 (item 2):
 * "Trial reduced to 30 days for all customers including founding cohort
 *  #2-20. EXCEPTION: Mo as customer #1 keeps 60-day trial as a one-off
 *  'First Customer Recognition' grandfather clause."
 *
 * The Mo override is set in his contract + via the
 * `trial_days_override` parameter when his subscription is created.
 * No other customer gets >30 days without an explicit founder decision
 * captured per-customer in `companies.signing_authority_email`-tied
 * notes.
 */
export const STANDARD_TRIAL_DAYS = 30;

/**
 * Mo's First Customer Recognition trial — 60 days. Hard-coded here so
 * any code path that needs it can reference a named constant rather
 * than a magic number. Used by Mo's onboarding override only.
 */
export const FIRST_CUSTOMER_TRIAL_DAYS = 60;

/**
 * Compute trial end date — defaults to STANDARD_TRIAL_DAYS, accepts an
 * override for Mo (60 days) or any future per-customer authorisation.
 * UTC.
 */
export function trialEndsAt(
  from: Date = new Date(),
  trialDays: number = STANDARD_TRIAL_DAYS,
): Date {
  const t = new Date(from);
  t.setUTCDate(t.getUTCDate() + trialDays);
  return t;
}
