// FLOSTRUCTION sentence renderer v1 — the core component of the page
// paradigm (dispatch 2026-06-12, SS5 BUILD a). Maps shift_events rows to
// calm English sentences in the system voice. Every sentence type is
// enumerated below, tested in sentences.test.ts, and traceable to the
// rows it was rendered from (eventIds).
//
// Voice law (SS8): direct, warm, factual Australian English. No emojis.
// No exclamation marks. The system reads the data so the operator
// does not.

/** The full shift_events taxonomy as enforced by the production CHECK
 *  constraint (m0d trim, 2026-06-05). The exhaustiveness test fails if
 *  a type is added to the database without a disposition here. */
export const EVENT_TYPES = [
  'START_EVENT',
  'END_EVENT',
  'SHIFT_COMMIT',
  'SUPERVISOR_APPROVAL',
  'PAYROLL_APPROVAL',
  'INTELLIGENCE_CLEAR',
  'ANOMALY_FLAG',
  'DISPUTE_RAISED',
  'EXPORT_RECORD',
  'CORRECTION',
  'BUG_CORRECTION',
  'SUPERVISOR_RE_APPROVAL',
  'WORKER_DISPUTE_FILED',
  'WORKER_CREATED',
  'X-FLOSMOSIS-SPEC_VERSION_MIGRATION',
  'X-FLOSMOSIS-SPEC_VERSION_ANOMALY',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Where each event type surfaces on the daily page.
 *  'handled'  — rendered as a sentence under Handled.
 *  'presence' — feeds the on-site-now section, not a sentence.
 *  'silent'   — substrate bookkeeping; never narrated. */
export const EVENT_DISPOSITION: Record<EventType, 'handled' | 'presence' | 'silent'> = {
  START_EVENT: 'presence',
  END_EVENT: 'presence',
  SHIFT_COMMIT: 'handled',
  SUPERVISOR_APPROVAL: 'handled',
  PAYROLL_APPROVAL: 'handled',
  INTELLIGENCE_CLEAR: 'handled',
  ANOMALY_FLAG: 'handled',
  DISPUTE_RAISED: 'handled',
  EXPORT_RECORD: 'handled',
  CORRECTION: 'handled',
  BUG_CORRECTION: 'handled',
  SUPERVISOR_RE_APPROVAL: 'handled',
  WORKER_DISPUTE_FILED: 'handled',
  WORKER_CREATED: 'handled',
  'X-FLOSMOSIS-SPEC_VERSION_MIGRATION': 'silent',
  'X-FLOSMOSIS-SPEC_VERSION_ANOMALY': 'silent',
};

export interface SentenceEventRow {
  id: string;
  event_type: string;
  created_at: string;
  event_data: Record<string, unknown> | null;
  worker_id: string | null;
  site_id: string | null;
}

export interface SentenceContext {
  /** worker_id -> display name */
  workerNames: Readonly<Record<string, string>>;
  /** site_id -> site name */
  siteNames: Readonly<Record<string, string>>;
}

export interface PageSentence {
  /** Lead fragment, rendered bold. */
  lead: string;
  /** Remainder of the sentence, plain weight. */
  rest: string;
  /** Right-hand mono reference (receipt ids, times, counts). */
  refText: string;
  /** Every shift_events row this sentence was rendered from. */
  eventIds: ReadonlyArray<string>;
  /** Failure sentences render in red; everything else is calm. */
  tone: 'calm' | 'failure';
}

function receiptOf(e: SentenceEventRow): string | null {
  const r = e.event_data?.['receipt_id'];
  return typeof r === 'string' && r.length > 0 ? r : null;
}

function receiptRange(events: ReadonlyArray<SentenceEventRow>): string {
  const receipts = events
    .map(receiptOf)
    .filter((r): r is string => r !== null)
    .sort();
  if (receipts.length === 0) return '';
  if (receipts.length === 1) return receipts[0] as string;
  return `${receipts[0]}–${receipts[receipts.length - 1]}`;
}

function nameOf(ctx: SentenceContext, workerId: string | null): string {
  if (workerId !== null) {
    const n = ctx.workerNames[workerId];
    if (n !== undefined && n.length > 0) return n;
  }
  return 'A worker';
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Render the Handled section: aggregated, calm, traceable. Events must
 *  belong to a single company; ordering of output is fixed by class. */
export function renderHandledSentences(
  events: ReadonlyArray<SentenceEventRow>,
  ctx: SentenceContext,
): PageSentence[] {
  const handled = events.filter((e) => {
    const d = EVENT_DISPOSITION[e.event_type as EventType];
    return d === 'handled';
  });
  const byType = new Map<string, SentenceEventRow[]>();
  for (const e of handled) {
    const list = byType.get(e.event_type) ?? [];
    list.push(e);
    byType.set(e.event_type, list);
  }
  const out: PageSentence[] = [];

  const commits = byType.get('SHIFT_COMMIT') ?? [];
  const approvals = byType.get('SUPERVISOR_APPROVAL') ?? [];
  if (commits.length > 0) {
    const agreed = approvals.length > 0;
    out.push({
      lead: `Sealed ${commits.length} ${plural(commits.length, 'shift', 'shifts')}`,
      rest: agreed
        ? ' — worker and supervisor agreed on every one.'
        : ' — each one committed to the record.',
      refText: receiptRange(commits),
      eventIds: [...commits, ...approvals].map((e) => e.id),
      tone: 'calm',
    });
  } else if (approvals.length > 0) {
    out.push({
      lead: `Recorded ${approvals.length} supervisor ${plural(approvals.length, 'approval', 'approvals')}`,
      rest: ' — each reply sealed against its shift.',
      refText: receiptRange(approvals),
      eventIds: approvals.map((e) => e.id),
      tone: 'calm',
    });
  }

  const payroll = byType.get('PAYROLL_APPROVAL') ?? [];
  if (payroll.length > 0) {
    out.push({
      lead: `Approved ${payroll.length} ${plural(payroll.length, 'shift', 'shifts')} for payroll`,
      rest: ' — held with the export until you run it.',
      refText: receiptRange(payroll),
      eventIds: payroll.map((e) => e.id),
      tone: 'calm',
    });
  }

  const exports_ = byType.get('EXPORT_RECORD') ?? [];
  if (exports_.length > 0) {
    out.push({
      lead: `Wrote ${exports_.length} export ${plural(exports_.length, 'record', 'records')}`,
      rest: ' — each one fingerprinted into its pack.',
      refText: receiptRange(exports_),
      eventIds: exports_.map((e) => e.id),
      tone: 'calm',
    });
  }

  const clears = byType.get('INTELLIGENCE_CLEAR') ?? [];
  if (clears.length > 0) {
    out.push({
      lead: `Checked ${clears.length} ${plural(clears.length, 'shift', 'shifts')} against the rules`,
      rest: ' — nothing needed your attention.',
      refText: receiptRange(clears),
      eventIds: clears.map((e) => e.id),
      tone: 'calm',
    });
  }

  const anomalies = byType.get('ANOMALY_FLAG') ?? [];
  for (const a of anomalies) {
    out.push({
      lead: `Noted something unusual on ${nameOf(ctx, a.worker_id)}’s shift`,
      rest: ' — flagged for your eyes, nothing blocked.',
      refText: receiptOf(a) ?? '',
      eventIds: [a.id],
      tone: 'calm',
    });
  }

  const disputes = [
    ...(byType.get('DISPUTE_RAISED') ?? []),
    ...(byType.get('WORKER_DISPUTE_FILED') ?? []),
  ];
  for (const d of disputes) {
    out.push({
      lead: `${nameOf(ctx, d.worker_id)} raised a dispute`,
      rest: ' — the shift is held and both accounts are preserved.',
      refText: receiptOf(d) ?? '',
      eventIds: [d.id],
      tone: 'calm',
    });
  }

  const corrections = [
    ...(byType.get('CORRECTION') ?? []),
    ...(byType.get('BUG_CORRECTION') ?? []),
    ...(byType.get('SUPERVISOR_RE_APPROVAL') ?? []),
  ];
  if (corrections.length > 0) {
    out.push({
      lead: `Corrected ${corrections.length} ${plural(corrections.length, 'record', 'records')}`,
      rest: ' — the originals stay preserved beside the corrections.',
      refText: receiptRange(corrections),
      eventIds: corrections.map((e) => e.id),
      tone: 'calm',
    });
  }

  const joins = byType.get('WORKER_CREATED') ?? [];
  for (const j of joins) {
    out.push({
      lead: `${nameOf(ctx, j.worker_id)} joined`,
      rest: ' — their record starts here and belongs to the work.',
      refText: '',
      eventIds: [j.id],
      tone: 'calm',
    });
  }

  return out;
}

/** The chain-failure sentence — the only place the page speaks in red.
 *  Scoped per Lee & See: what broke, what is held, what verified clean. */
export function renderChainFailureSentence(args: {
  mismatchCount: number;
  cleanCount: number;
}): PageSentence {
  const n = args.mismatchCount;
  return {
    lead: `${n} ${plural(n, 'record', 'records')} failed verification`,
    rest: ` — the chain caught it and is holding the evidence. The other ${args.cleanCount} verified clean.`,
    refText: 'held',
    eventIds: [],
    tone: 'failure',
  };
}
