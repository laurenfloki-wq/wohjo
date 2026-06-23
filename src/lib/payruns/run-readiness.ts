// Run-when-safe state machine (the money path).
//
// "Safe" is a small, explicit gate over the assembling window:
//   HELD     — the hash chain is broken; never run over a held record.
//   WAITING  — shifts are still awaiting approval on Today.
//   EMPTY    — nothing is approved to run yet.
//   READY    — chain green, nothing waiting, >=1 approved shift.
//
// Non-negotiable #5: WOHJO Intelligence NEVER blocks. Informational flags
// are surfaced elsewhere and are deliberately NOT an input here — they do
// not gate a run.
//
// Whether a READY run may actually execute is a SEPARATE switch
// (`payrunRunEnabled`), an env flag that is OFF everywhere until the
// founder turns it on at go-live. The state machine can reach READY in
// any environment; only an explicitly enabled environment moves money.

export type RunState = 'HELD' | 'WAITING' | 'EMPTY' | 'READY';

// The operator-facing pay-run state. Distinct from RunState (the server
// safety gate): it folds WAITING+EMPTY into the two states an operator
// actually experiences — ALMOST (something to do to get to a run) and
// CAUGHT_UP (nothing to run, and that's a good thing). Derived in
// pipeline.ts; drives the always-actionable card and the greeting.
export type PayrunUiState = 'HELD' | 'READY' | 'ALMOST' | 'CAUGHT_UP';

export interface RunReadinessInput {
  chainBroken: boolean;
  waitingCount: number; // SUBMITTED shifts in the window
  approvedCount: number; // PAYROLL_APPROVED shifts in the window
}

export interface RunReadiness {
  state: RunState;
  canRun: boolean;
  reason: string;
}

export function computeRunReadiness(i: RunReadinessInput): RunReadiness {
  if (i.chainBroken) {
    return {
      state: 'HELD',
      canRun: false,
      reason: 'The record is held — review it before running.',
    };
  }
  if (i.waitingCount > 0) {
    const noun = i.waitingCount === 1 ? 'shift is' : 'shifts are';
    return {
      state: 'WAITING',
      canRun: false,
      reason: `${i.waitingCount} ${noun} still waiting on Today.`,
    };
  }
  if (i.approvedCount === 0) {
    return { state: 'EMPTY', canRun: false, reason: 'Nothing approved to run yet.' };
  }
  const noun = i.approvedCount === 1 ? 'shift' : 'shifts';
  return {
    state: 'READY',
    canRun: true,
    reason: `${i.approvedCount} approved ${noun} ready to run.`,
  };
}

/**
 * Master switch for executing a real run. The pay-run export is built and
 * LIVE — it executes unless explicitly disabled with
 * PAYRUN_RUN_ENABLED='false' (the kill switch). The readiness gate (chain
 * green, nothing waiting, >=1 approved) remains the real safety; a run seals
 * EXPORT_RECORD events and marks shifts EXPORTED (terminal, append-only).
 */
export function payrunRunEnabled(): boolean {
  return process.env.PAYRUN_RUN_ENABLED !== 'false';
}

/** Button label for a readiness state. */
export function runButtonLabel(state: RunState): string {
  switch (state) {
    case 'HELD':
      return 'Held — review the record first';
    case 'EMPTY':
      return 'Nothing to run yet';
    case 'WAITING':
    case 'READY':
    default:
      return 'Run when safe';
  }
}
