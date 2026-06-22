import { describe, it, expect } from 'vitest';
import {
  evaluateCountAnchor,
  type CompanyV1Snapshot,
  type V1Watermark,
} from './count-anchor';

const C = '00000000-1000-0000-0000-000000000001';
const wm = (over: Partial<V1Watermark> = {}): Map<string, V1Watermark> =>
  new Map([[C, { company_id: C, event_count: 15, tail_event_hash: 'hashZ', ...over }]]);
const snap = (over: Partial<CompanyV1Snapshot> = {}): CompanyV1Snapshot => ({
  company_id: C,
  liveV1Count: 15,
  v1Hashes: new Set(['hashA', 'hashZ']),
  ...over,
});

describe('evaluateCountAnchor (audit A1)', () => {
  it('no violation when live count == mark and tail present', () => {
    expect(evaluateCountAnchor([snap()], wm())).toEqual([]);
  });

  it('flags V1_COUNT_REGRESSION when the ledger shrank', () => {
    const v = evaluateCountAnchor([snap({ liveV1Count: 12 })], wm());
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ reason: 'V1_COUNT_REGRESSION', expected: '>=15', actual: '12' });
  });

  it('flags V1_TAIL_MISSING when the recorded tail event is gone', () => {
    const v = evaluateCountAnchor([snap({ v1Hashes: new Set(['hashA']) })], wm());
    expect(v.map((x) => x.reason)).toContain('V1_TAIL_MISSING');
  });

  it('does NOT flag when live count grew (append-only correction)', () => {
    // 18 live, tail advanced to a new hash that is present
    const v = evaluateCountAnchor(
      [snap({ liveV1Count: 18, v1Hashes: new Set(['hashZ', 'hashNew']) })],
      wm({ event_count: 18, tail_event_hash: 'hashNew' }),
    );
    expect(v).toEqual([]);
  });

  it('skips companies with no watermark (nothing sealed yet)', () => {
    expect(evaluateCountAnchor([snap()], new Map())).toEqual([]);
  });

  it('reports both regression and tail-missing for a tail truncation', () => {
    const v = evaluateCountAnchor([snap({ liveV1Count: 14, v1Hashes: new Set(['hashA']) })], wm());
    expect(v.map((x) => x.reason).sort()).toEqual(['V1_COUNT_REGRESSION', 'V1_TAIL_MISSING']);
  });
});
