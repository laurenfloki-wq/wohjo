// Pay-run situation — the always-actionable derivation behind the card.
//
// One pure function turns the window's shift mix + chain health into a
// single PayrunSituation that BOTH /today and /payruns render, so the
// headline can never promise a run the destination denies. Every state
// ends in either a calm "you're caught up" or a concrete next move — never
// a disabled "Nothing to run yet" dead end.
//
// The READY gate here uses the SAME inputs as the server run gate
// (computeRunReadiness over the same 7-day window), so "Run pay run" only
// ever appears when POST /api/command/payruns/run will actually accept it.

import { computeRunReadiness, type PayrunUiState } from './run-readiness';
import type { ShiftRow } from '@/lib/page/today-data';

/** The run buckets, all age-independent (Payday Super completeness): a run
 *  takes EVERY approved shift, so approvedToRun is every PAYROLL_APPROVED
 *  shift regardless of age, and the waiting buckets are the live backlog.
 *  Nothing here is windowed — the card never reads "caught up" while an
 *  approved entitlement or a pending decision still sits in the queue. */
export interface RunBuckets {
  /** IN_PROGRESS — still recording on site. */
  onSite: number;
  /** SUBMITTED on a normal site — waiting on the site supervisor. */
  awaitingSupervisor: number;
  /** SUPERVISOR_APPROVED, plus SUBMITTED on a director-supervised site
   *  (where one tap seals both gates) — waiting on the operator. */
  awaitingYou: number;
  /** PAYROLL_APPROVED — approved and ready to run (any age). */
  approvedToRun: number;
  /** Verified hours across the approved-to-run shifts. */
  approvedHours: number;
}

/** Fold the open backlog into the run buckets. directorSiteIds are the sites
 *  where the supervisor is also the director — a SUBMITTED shift there is the
 *  operator's to approve, not a third party's. */
export function bucketShifts(
  openShifts: ReadonlyArray<ShiftRow>,
  directorSiteIds: ReadonlySet<string>,
): RunBuckets {
  let onSite = 0;
  let awaitingSupervisor = 0;
  let awaitingYou = 0;
  let approvedToRun = 0;
  let approvedHours = 0;
  for (const s of openShifts) {
    switch (s.status) {
      case 'IN_PROGRESS':
        onSite++;
        break;
      case 'SUBMITTED':
        if (s.site_id !== null && directorSiteIds.has(s.site_id)) awaitingYou++;
        else awaitingSupervisor++;
        break;
      case 'SUPERVISOR_APPROVED':
        awaitingYou++;
        break;
      case 'PAYROLL_APPROVED':
        approvedToRun++;
        approvedHours += s.total_hours !== null ? Number(s.total_hours) : 0;
        break;
      default:
        break;
    }
  }
  return { onSite, awaitingSupervisor, awaitingYou, approvedToRun, approvedHours };
}

export interface PayrunLink {
  label: string;
  href: string;
}

export interface PayrunSituation {
  state: PayrunUiState;
  /** True only when the server run gate will accept a run right now. */
  canRun: boolean;
  /** Styling intent: calm (caught up), go (ready), work (almost), alarm (held). */
  tone: 'calm' | 'go' | 'work' | 'alarm';
  /** The lead sentence — always a statement of where things stand. */
  headline: string;
  /** A quieter supporting line. */
  detail: string;
  /** The label for the live run button (READY only). */
  runLabel: string;
  /** Reason string passed through to the run button title. */
  runReason: string;
  /** The primary next move when it's a link (ALMOST review / HELD record). */
  primary: PayrunLink | null;
  /** A secondary link (CAUGHT_UP → view last run). */
  secondary: PayrunLink | null;
  /** Quiet "still with the site / on site" lines for ALMOST. */
  notes: string[];
  /** The stage strip — only non-zero stages are shown. */
  pipeline: {
    onSite: number;
    awaitingSupervisor: number;
    awaitingYou: number;
    approvedToRun: number;
  };
}

export interface PayrunSituationInput {
  chainBroken: boolean;
  buckets: RunBuckets;
  /** Where "Review & approve" sends the operator (an in-page anchor on
   *  /today, a link to /today from /payruns). */
  approvalsHref: string;
  /** Where "Review the held record" sends the operator. */
  heldHref: string;
  /** The last kept run, for the caught-up "view last run" link. */
  lastRun: PayrunLink | null;
}

/** Tidy hours: 31.5 → "31.5", 8 → "8", 7.25 → "7.25". */
function fmtHours(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function derivePayrunSituation(input: PayrunSituationInput): PayrunSituation {
  const { chainBroken, buckets, approvalsHref, heldHref, lastRun } = input;
  const { onSite, awaitingSupervisor, awaitingYou, approvedToRun, approvedHours } = buckets;

  // Shifts still awaiting approval no longer block a run (they simply aren't
  // approved yet) — so waitingCount is 0 here. The run gate is: chain green
  // and at least one approved shift to include.
  const readiness = computeRunReadiness({
    chainBroken,
    waitingCount: 0,
    approvedCount: approvedToRun,
  });

  const pipeline = { onSite, awaitingSupervisor, awaitingYou, approvedToRun };
  const active = onSite + awaitingSupervisor + awaitingYou + approvedToRun > 0;

  // HELD — the only hard stop, and it's honest about why.
  if (chainBroken) {
    return {
      state: 'HELD',
      canRun: false,
      tone: 'alarm',
      headline: 'A record needs review before you can run.',
      detail:
        'Nothing exports over a held record — the sealed value and the live value are both kept as evidence.',
      runLabel: '',
      runReason: readiness.reason,
      primary: { label: 'Review the held record →', href: heldHref },
      secondary: null,
      notes: [],
      pipeline,
    };
  }

  // READY — chain green, nothing waiting, ≥1 approved. The payoff.
  if (readiness.canRun) {
    const noun = plural(approvedToRun, 'shift', 'shifts');
    return {
      state: 'READY',
      canRun: true,
      tone: 'go',
      headline: `${approvedToRun} approved ${noun} · ${fmtHours(approvedHours)} verified hours, ready to run.`,
      detail: 'One run seals the Evidence Pack and the payroll file together — both carry the same hash.',
      runLabel: `Run pay run · ${approvedToRun} ${noun} · ${fmtHours(approvedHours)} hrs →`,
      runReason: readiness.reason,
      primary: null,
      secondary: null,
      notes: [],
      pipeline,
    };
  }

  // ALMOST — chain green, can't run yet, but there's a clear next move.
  if (active) {
    const notes: string[] = [];
    if (awaitingSupervisor > 0) {
      notes.push(
        `${awaitingSupervisor} ${plural(awaitingSupervisor, 'shift is', 'shifts are')} still with the site supervisor.`,
      );
    }
    if (onSite > 0) {
      notes.push(`${onSite} ${plural(onSite, 'shift is', 'shifts are')} still recording on site.`);
    }
    if (approvedToRun > 0) {
      notes.push(
        `${approvedToRun} already approved — ${plural(approvedToRun, 'it runs', 'they run')} once the rest settle.`,
      );
    }
    if (awaitingYou > 0) {
      return {
        state: 'ALMOST',
        canRun: false,
        tone: 'work',
        headline: `${awaitingYou} ${plural(awaitingYou, 'shift is', 'shifts are')} waiting on your approval.`,
        detail: 'Approve to move the run forward — the chain re-checks each one as you do.',
        runLabel: '',
        runReason: readiness.reason,
        primary: { label: 'Review & approve →', href: approvalsHref },
        secondary: null,
        notes,
        pipeline,
      };
    }
    return {
      state: 'ALMOST',
      canRun: false,
      tone: 'work',
      headline: 'This run is on its way — nothing is waiting on you.',
      detail: 'Shifts are still settling. The run becomes ready the moment they do.',
      runLabel: '',
      runReason: readiness.reason,
      primary: null,
      secondary: null,
      notes,
      pipeline,
    };
  }

  // CAUGHT_UP — chain green, nothing in flight. Calm, not a dead end.
  return {
    state: 'CAUGHT_UP',
    canRun: false,
    tone: 'calm',
    headline: lastRun !== null ? `All caught up — last run sealed ${lastRun.label}.` : 'All caught up.',
    detail:
      'Nothing is approved or waiting. The next run assembles itself as this week’s shifts come in.',
    runLabel: '',
    runReason: readiness.reason,
    primary: null,
    secondary: lastRun,
    notes: [],
    pipeline,
  };
}
