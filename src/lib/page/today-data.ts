// Today page composition — pure derivation from live rows to the page
// model. No I/O here; today/page.tsx feeds it repository results and
// renders the result. Tested in today-data.test.ts.

import { CHAIN_BASELINE_EVENT_IDS } from '@/lib/wles/chain-baseline';

export interface HealthRow {
  check_name: string;
  status: string;
  run_at: string;
  detail: Record<string, unknown> | null;
}

export interface AnchorRow {
  id: string;
  matches: boolean | null;
  expected_count: number | null;
  actual_count: number | null;
}

export interface ShiftRow {
  id: string;
  status: string;
  total_hours: number | string | null;
  shift_date: string | null;
  receipt_id: string | null;
  worker_id: string | null;
  site_id: string | null;
  start_time: string | null;
  end_time?: string | null;
}

export interface ChainState {
  broken: boolean;
  /** events that verified clean at the last sweep */
  cleanCount: number;
  /** denominator excluding the signed known-exceptions baseline */
  expectedCount: number;
  /** mismatches beyond the signed baseline (genuine alarm) */
  extraMismatchCount: number;
  /** mono chain line for the page top */
  chainText: string;
  /** latest sweep timestamp, ISO — null until the first sweep lands */
  sweepAt: string | null;
}

const TZ = 'Australia/Sydney';

export function sydneyTime(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function sydneyDateLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function sydneyWeekday(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long' }).format(d);
}

export function sydneyHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d),
  );
}

export function sydneyDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function greetingWord(now: Date): string {
  const h = sydneyHour(now);
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function latestByCheck(rows: ReadonlyArray<HealthRow>): Map<string, HealthRow> {
  const m = new Map<string, HealthRow>();
  for (const r of rows) {
    if (!m.has(r.check_name)) m.set(r.check_name, r); // rows arrive newest-first
  }
  return m;
}

/** Derive the chain state from anchors + the latest health sweeps.
 *  The raw chain check is never filtered; the operational signal
 *  subtracts only the signed known-exceptions baseline (PR #98). */
export function deriveChainState(
  anchors: ReadonlyArray<AnchorRow>,
  health: ReadonlyArray<HealthRow>,
): ChainState {
  const anchorsOk = anchors.length > 0 && anchors.every((a) => a.matches === true);
  const latest = latestByCheck(health);
  const exBaseline = latest.get('chain_integrity_shift_events_ex_baseline');
  const raw = latest.get('chain_integrity_shift_events');

  const scanned =
    typeof raw?.detail?.['events_scanned'] === 'number'
      ? (raw.detail['events_scanned'] as number)
      : 0;
  const rawMismatch =
    typeof raw?.detail?.['mismatch_count'] === 'number'
      ? (raw.detail['mismatch_count'] as number)
      : 0;

  const baselined = Math.min(CHAIN_BASELINE_EVENT_IDS.size, rawMismatch);
  let extra: number;
  if (exBaseline !== undefined) {
    const exMismatch =
      typeof exBaseline.detail?.['mismatch_count'] === 'number'
        ? (exBaseline.detail['mismatch_count'] as number)
        : 0;
    extra = exBaseline.status === 'RED' ? Math.max(exMismatch, 1) : 0;
  } else {
    extra = Math.max(0, rawMismatch - baselined);
  }

  const expected = Math.max(0, scanned - baselined);
  const clean = Math.max(0, scanned - rawMismatch);
  const broken = !anchorsOk || extra > 0;
  const sweepAt = raw?.run_at ?? null;
  const chainText = broken
    ? `chain alert · ${clean}/${expected}`
    : `chain verified · ${clean}/${expected}`;
  return {
    broken,
    cleanCount: clean,
    expectedCount: expected,
    extraMismatchCount: extra,
    chainText,
    sweepAt,
  };
}

export interface WeekReading {
  verifiedHours: number;
  deltaPct: number | null;
  sealedCount: number;
  inMotionCount: number;
  waitingCount: number;
}

const VERIFIED_STATUSES = new Set(['SUBMITTED', 'APPROVED', 'EXPORTED']);

export function deriveWeekReading(
  weekShifts: ReadonlyArray<ShiftRow>,
  prevWeekShifts: ReadonlyArray<ShiftRow>,
): WeekReading {
  const hours = (rows: ReadonlyArray<ShiftRow>): number =>
    rows
      .filter((s) => VERIFIED_STATUSES.has(s.status) && s.total_hours !== null)
      .reduce((acc, s) => acc + Number(s.total_hours), 0);
  const thisWeek = hours(weekShifts);
  const lastWeek = hours(prevWeekShifts);
  const deltaPct =
    lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 1000) / 10 : null;
  return {
    verifiedHours: Math.round(thisWeek * 10) / 10,
    deltaPct,
    sealedCount: weekShifts.filter((s) => s.status === 'APPROVED' || s.status === 'EXPORTED')
      .length,
    inMotionCount: weekShifts.filter((s) => s.status === 'IN_PROGRESS').length,
    waitingCount: weekShifts.filter((s) => s.status === 'SUBMITTED').length,
  };
}

/** Count of kept daily pages — distinct Sydney days carrying events. */
export function archiveDayCount(eventCreatedAts: ReadonlyArray<string>): number {
  const days = new Set<string>();
  for (const iso of eventCreatedAts) days.add(sydneyDateKey(iso));
  return days.size;
}

/** Greeting headline parts. `safe` is styled green, `alarm` red. */
export interface GreetingModel {
  before: string;
  emphasis: string;
  emphasisTone: 'safe' | 'alarm';
  after: string;
  sub: string;
}

export function deriveGreeting(args: {
  now: Date;
  chain: ChainState;
  waitingCount: number;
  week: WeekReading;
}): GreetingModel {
  const word = greetingWord(args.now);
  if (args.chain.broken) {
    const n = Math.max(args.chain.extraMismatchCount, 1);
    return {
      before: `${word}. `,
      emphasis: `${n === 1 ? 'One record' : `${n} records`} failed verification`,
      emphasisTone: 'alarm',
      after: ' — the chain caught it and nothing has been lost.',
      sub: `The evidence is held: the sealed value and the current value are both preserved. The pay run is held until you review it. Everything else verified clean (${args.chain.cleanCount} of ${args.chain.expectedCount}).`,
    };
  }
  const hoursLine =
    args.week.verifiedHours > 0
      ? `${args.week.verifiedHours} hours stand verified this week${
          args.week.deltaPct !== null
            ? `, ${args.week.deltaPct >= 0 ? `${args.week.deltaPct}% up on` : `${Math.abs(args.week.deltaPct)}% down on`} last`
            : ''
        }. `
      : '';
  if (args.waitingCount === 0) {
    return {
      before: `${word}. Everything ran properly overnight, and the next pay run is `,
      emphasis: 'safe to run',
      emphasisTone: 'safe',
      after: '.',
      sub: `${hoursLine}Nothing is waiting on you. Nothing else needs reading.`,
    };
  }
  const n = args.waitingCount;
  const decisions = n === 1 ? 'one decision' : `${n} decisions`;
  return {
    before: `${word}. Everything ran properly overnight, and the next pay run is ${decisions} from `,
    emphasis: 'safe',
    emphasisTone: 'safe',
    after: '.',
    sub: `${hoursLine}Nothing else needs reading.`,
  };
}
