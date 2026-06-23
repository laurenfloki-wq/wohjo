import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

// A1 / WLES — v1 fingerprint anchor: formula-level negative test (item #5).
//
// The anchor binds an md5 roll-up over (id : event_hash) pairs of the frozen v1
// prefix, recomputed inline by v_anchor_verification:
//     md5(string_agg(id::text || ':' || event_hash, '|' ORDER BY created_at, id))
// This test proves the property the anchor depends on: ANY rewrite of the
// frozen population — a tampered tail payload (which changes that event's
// event_hash and, after a re-link, every following event_hash), a deletion, or
// a reorder — changes the fingerprint, so matches=false → anchor_fingerprint RED.
//
// It deliberately uses SYNTHETIC rows (no prod ids baked in). The bound value
// itself (ef655a3e618c4f295c4e6f2eb3b42360, count 15) was computed and verified
// directly in Postgres against live prod — see the migration header — and the
// LIVE "tamper → RED" proof on a scratch branch is the pre-prod-apply gate.

interface Ev { id: string; created_at: string; event_hash: string }

// Mirror the view's formula exactly: order by (created_at, id), join id:hash with '|', md5.
function rollup(events: Ev[]): string {
  const ordered = [...events].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const agg = ordered.map((e) => `${e.id}:${e.event_hash}`).join('|');
  return createHash('md5').update(agg, 'utf8').digest('hex');
}

const h = (n: number) => n.toString(16).padStart(64, '0'); // fake 64-hex hash
const BASE: Ev[] = [
  { id: 'aaaa', created_at: '2026-06-04T02:56:50.920Z', event_hash: h(1) },
  { id: 'bbbb', created_at: '2026-06-05T01:00:00.000Z', event_hash: h(2) },
  { id: 'cccc', created_at: '2026-06-06T01:00:00.000Z', event_hash: h(3) },
  { id: 'dddd', created_at: '2026-06-18T03:18:35.520Z', event_hash: h(4) }, // tail
];

describe('A1 v1 fingerprint anchor — md5 roll-up is standard + deterministic', () => {
  it('node md5 == standard md5 == Postgres md5() (known vector)', () => {
    // Postgres md5('abc') = 900150983cd24fb0d6963f7d28e17f72 — same as node.
    expect(createHash('md5').update('abc', 'utf8').digest('hex')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('is stable for the same population', () => {
    expect(rollup(BASE)).toBe(rollup([...BASE].reverse())); // order is by (created_at,id), not array order
  });
});

describe('A1 v1 fingerprint anchor — tamper/deletion/reorder all go RED', () => {
  const baseline = rollup(BASE);

  it('a tampered tail payload (changed event_hash) changes the fingerprint', () => {
    const tampered = BASE.map((e) => (e.id === 'dddd' ? { ...e, event_hash: h(999) } : e));
    expect(rollup(tampered)).not.toBe(baseline);
  });

  it('a re-link forward (every hash after the edit changes) changes the fingerprint', () => {
    // Attacker rewrites cccc and rechains: cccc + dddd both get new hashes.
    const rechained = BASE.map((e) =>
      e.id === 'cccc' ? { ...e, event_hash: h(301) } :
      e.id === 'dddd' ? { ...e, event_hash: h(401) } : e,
    );
    expect(rollup(rechained)).not.toBe(baseline);
  });

  it('a deleted event changes the fingerprint (and the count)', () => {
    const deleted = BASE.filter((e) => e.id !== 'bbbb');
    expect(rollup(deleted)).not.toBe(baseline);
    expect(deleted.length).not.toBe(BASE.length); // count anchor catches this too
  });

  it('a swapped tail (same hashes, different identity binding) changes the fingerprint', () => {
    // Swap which id carries which hash — chain may still "link" but the id:hash
    // binding the anchor froze is broken.
    const swapped = BASE.map((e) =>
      e.id === 'cccc' ? { ...e, event_hash: h(4) } :
      e.id === 'dddd' ? { ...e, event_hash: h(3) } : e,
    );
    expect(rollup(swapped)).not.toBe(baseline);
  });

  it('an APPENDED event after the cutoff is excluded (does NOT change the frozen fingerprint)', () => {
    // The view filters created_at < cutoff, so legitimate new v1 activity must
    // NOT flip the anchor RED — only tampering the frozen prefix does.
    const CUTOFF = '2026-06-19T00:00:00.000Z';
    const withAppend = [
      ...BASE,
      { id: 'eeee', created_at: '2026-06-20T01:00:00.000Z', event_hash: h(5) },
    ];
    const frozenPrefix = (evs: Ev[]) => rollup(evs.filter((e) => e.created_at < CUTOFF));
    expect(frozenPrefix(withAppend)).toBe(baseline);
  });
});
