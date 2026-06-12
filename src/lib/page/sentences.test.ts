import { describe, expect, it } from 'vitest';
import {
  EVENT_DISPOSITION,
  EVENT_TYPES,
  renderChainFailureSentence,
  renderHandledSentences,
  type SentenceContext,
  type SentenceEventRow,
} from './sentences';

const ctx: SentenceContext = {
  workerNames: { w1: 'Demo Worker', w2: 'A. Carpenter' },
  siteNames: { s1: 'Mt Stromlo Works' },
};

function ev(partial: Partial<SentenceEventRow> & { id: string; event_type: string }): SentenceEventRow {
  return {
    created_at: '2026-06-12T05:02:00Z',
    event_data: null,
    worker_id: null,
    site_id: null,
    ...partial,
  };
}

describe('sentence renderer v1 — taxonomy', () => {
  it('every event type in the production CHECK constraint has a disposition', () => {
    for (const t of EVENT_TYPES) {
      expect(EVENT_DISPOSITION[t]).toMatch(/^(handled|presence|silent)$/);
    }
    expect(Object.keys(EVENT_DISPOSITION).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it('presence and silent events never become Handled sentences', () => {
    const out = renderHandledSentences(
      [
        ev({ id: 'a', event_type: 'START_EVENT' }),
        ev({ id: 'b', event_type: 'END_EVENT' }),
        ev({ id: 'c', event_type: 'X-FLOSMOSIS-SPEC_VERSION_MIGRATION' }),
      ],
      ctx,
    );
    expect(out).toEqual([]);
  });
});

describe('sentence renderer v1 — sentences', () => {
  it('seals commits with supervisor agreement and a receipt range', () => {
    const out = renderHandledSentences(
      [
        ev({ id: 'c1', event_type: 'SHIFT_COMMIT', event_data: { receipt_id: 'FSTR-0085' } }),
        ev({ id: 'c2', event_type: 'SHIFT_COMMIT', event_data: { receipt_id: 'FSTR-0096' } }),
        ev({ id: 'a1', event_type: 'SUPERVISOR_APPROVAL', event_data: { receipt_id: 'FSTR-0085' } }),
      ],
      ctx,
    );
    expect(out).toHaveLength(1);
    const s = out[0];
    expect(s?.lead).toBe('Sealed 2 shifts');
    expect(s?.rest).toContain('worker and supervisor agreed');
    expect(s?.refText).toBe('FSTR-0085–FSTR-0096');
    expect(s?.eventIds).toEqual(['c1', 'c2', 'a1']);
    expect(s?.tone).toBe('calm');
  });

  it('uses singular forms for one shift', () => {
    const out = renderHandledSentences(
      [ev({ id: 'c1', event_type: 'SHIFT_COMMIT', event_data: { receipt_id: 'FSTR-0001' } })],
      ctx,
    );
    expect(out[0]?.lead).toBe('Sealed 1 shift');
  });

  it('names the worker on a dispute and preserves traceability', () => {
    const out = renderHandledSentences(
      [ev({ id: 'd1', event_type: 'WORKER_DISPUTE_FILED', worker_id: 'w2' })],
      ctx,
    );
    expect(out[0]?.lead).toContain('A. Carpenter raised a dispute');
    expect(out[0]?.eventIds).toEqual(['d1']);
  });

  it('falls back calmly when a worker name is unknown', () => {
    const out = renderHandledSentences(
      [ev({ id: 'a1', event_type: 'ANOMALY_FLAG', worker_id: 'missing' })],
      ctx,
    );
    expect(out[0]?.lead).toContain('A worker’s shift');
  });

  it('never uses exclamation marks or emojis — the system voice is calm', () => {
    const all = renderHandledSentences(
      EVENT_TYPES.map((t, i) => ev({ id: `e${i}`, event_type: t, worker_id: 'w1' })),
      ctx,
    );
    for (const s of all) {
      const text = s.lead + s.rest;
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe('chain failure sentence — the only red', () => {
  it('is scoped: what broke, what is held, what verified clean', () => {
    const s = renderChainFailureSentence({ mismatchCount: 1, cleanCount: 95 });
    expect(s.tone).toBe('failure');
    expect(s.lead).toBe('1 record failed verification');
    expect(s.rest).toContain('holding the evidence');
    expect(s.rest).toContain('95 verified clean');
    expect(s.refText).toBe('held');
  });
});
