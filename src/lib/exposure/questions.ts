// Client-safe question presentation — the ONLY exposure module the browser
// bundle imports. It carries prompts, choices (value + label), kinds, gating
// and profiling captures, but NO scoring weights, band thresholds, compliance
// facts or hand-off copy. Those live server-side in rules.config.ts, which
// imports THIS file and attaches the weights. So wording lives once (here),
// weights live once (there), and the rule set is never exposed client-side
// (§3: "the client sends answers, the server returns the scored result").

import type { PublicQuestion } from './types';

/** Ruleset version surfaced to the client (display + submit). Source of truth. */
export const EXPOSURE_RULESET_VERSION = '2026-06-28-draft.1';

/**
 * The 9 screens, in order. State + worker band first (they gate which rules
 * apply). Sentence case, trade-literate, asks current state not intentions.
 */
export const PUBLIC_QUESTIONS: PublicQuestion[] = [
  {
    id: 'states',
    kind: 'states',
    captures: 'states',
    prompt: 'Which state(s) do you place or supply workers into?',
    help: 'Pick every state where your workers actually do the work. This decides which rules apply to you.',
    // choices are populated at runtime from the canonical LICENCE_STATES.
  },
  {
    id: 'worker_band',
    kind: 'band',
    captures: 'worker_band',
    prompt: 'How many workers are on site in a typical week?',
    choices: [
      { value: '1-5', label: '1–5' },
      { value: '6-20', label: '6–20' },
      { value: '21-50', label: '21–50' },
      { value: '51-200', label: '51–200' },
      { value: '200+', label: 'More than 200' },
    ],
  },
  {
    id: 'records_method',
    vector: 'records',
    kind: 'single',
    prompt: 'How do you record start and finish times today?',
    help: 'However it actually happens on site right now — not how it is meant to happen.',
    choices: [
      { value: 'nothing', label: 'We don’t really record them' },
      { value: 'memory', label: 'From memory / worked out later' },
      { value: 'paper', label: 'Paper timesheets or a diary' },
      { value: 'spreadsheet', label: 'A spreadsheet' },
      { value: 'rostering', label: 'A rostering or scheduling app' },
      { value: 'biometric', label: 'Biometric / sign-on device' },
    ],
  },
  {
    id: 'records_survive',
    vector: 'records',
    kind: 'single',
    prompt: 'If a worker disputed their pay, would those records settle it?',
    choices: [
      { value: 'no', label: 'No — it would come down to who’s believed' },
      { value: 'unsure', label: 'Not sure they’d hold up' },
      { value: 'yes', label: 'Yes — approved and on file' },
    ],
  },
  {
    id: 'dispute_history',
    vector: 'fair_work',
    kind: 'single',
    prompt: 'Have you had a pay dispute or underpayment query in the last 12 months?',
    choices: [
      { value: 'recent', label: 'Yes — more than once' },
      { value: 'once', label: 'Yes — once' },
      { value: 'none', label: 'No' },
    ],
  },
  {
    id: 'licence_held',
    vector: 'licensing',
    kind: 'single',
    appliesWhen: { anyOperatingStateHasScheme: true },
    prompt: 'Do you hold a current labour hire licence everywhere you operate?',
    help: 'Only asked because you supply into a state that runs a licensing scheme.',
    choices: [
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'Not sure / not in every state' },
      { value: 'applying', label: 'Application in progress' },
      { value: 'yes', label: 'Yes — current in every state we supply' },
    ],
  },
  {
    id: 'super_cadence',
    vector: 'payday_super',
    kind: 'single',
    prompt: 'How often is super actually paid across to the funds?',
    choices: [
      { value: 'quarterly', label: 'Quarterly' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'each_run', label: 'Every pay run' },
      { value: 'unsure', label: 'Not sure' },
    ],
  },
  {
    id: 'director_aware',
    vector: 'payday_super',
    kind: 'single',
    prompt: 'Did you know unpaid super can attach to you personally as a director?',
    choices: [
      { value: 'no', label: 'No' },
      { value: 'somewhat', label: 'Heard of it, not across the detail' },
      { value: 'yes', label: 'Yes' },
    ],
  },
  {
    id: 'head_contractors',
    vector: 'chain',
    kind: 'single',
    prompt: 'Do you place workers under head contractors or principals?',
    choices: [
      { value: 'multiple', label: 'Yes — several' },
      { value: 'one', label: 'Yes — one or two' },
      { value: 'no', label: 'No — we engage direct' },
    ],
  },
];
