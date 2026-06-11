import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAIN_BASELINE_ID, CHAIN_BASELINE_EVENT_IDS } from '../../src/lib/wles/chain-baseline';

// Spine ruling 2026-06-12 -- pins for the chain-integrity baseline contract.

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const DOC_PATH = 'docs/evidence/chain-integrity-baseline-2026-06-12.json';
const ROUTE_PATH = 'src/app/api/cron/verify-hashes/route.ts';
const PENDING_EXPORT_RECORD = 'a7f7961a-8352-4c90-8efb-d843b6d2fe39';

describe('chain-integrity known-exceptions baseline', () => {
  const doc = JSON.parse(read(DOC_PATH)) as {
    baseline_id: string;
    classes: {
      PILOT_SPEC_FLUX: { events: Array<{ id: string; spec_version: string }> };
      SYNTHETIC_TEST_FIXTURE: { explanation: string; events: Array<{ id: string }> };
    };
  };

  it('code constant and evidentiary JSON agree exactly (11 pilot + 1 fixture)', () => {
    expect(doc.baseline_id).toBe(CHAIN_BASELINE_ID);
    const docIds = [
      ...doc.classes.PILOT_SPEC_FLUX.events.map((e) => e.id),
      ...doc.classes.SYNTHETIC_TEST_FIXTURE.events.map((e) => e.id),
    ].sort();
    expect(docIds).toEqual([...CHAIN_BASELINE_EVENT_IDS].sort());
    expect(doc.classes.PILOT_SPEC_FLUX.events.length).toBe(11);
    expect(docIds.length).toBe(12);
  });

  it('every pilot-class event is spec_version 0', () => {
    for (const e of doc.classes.PILOT_SPEC_FLUX.events) {
      expect(e.spec_version).toBe('0');
    }
  });

  it('the 2026-06-06 EXPORT_RECORD is baselined as an ATTRIBUTED fixture with the evidence chain', () => {
    expect(CHAIN_BASELINE_EVENT_IDS.has(PENDING_EXPORT_RECORD)).toBe(true);
    expect(doc.classes.SYNTHETIC_TEST_FIXTURE.events.map((e) => e.id)).toContain(PENDING_EXPORT_RECORD);
    expect(doc.classes.SYNTHETIC_TEST_FIXTURE.explanation).toContain('PR #44');
    expect(doc.classes.SYNTHETIC_TEST_FIXTURE.explanation).toContain('M4MINT Synthetic Test Worker');
  });

  it('verify-hashes records the RAW check unfiltered and the ex-baseline check filtered', () => {
    const src = read(ROUTE_PATH);
    // Raw record uses allMismatches and stays first.
    const rawIdx = src.indexOf("check_name: 'chain_integrity_shift_events',");
    const filterIdx = src.indexOf('const exBaselineMismatches');
    const exIdx = src.indexOf("check_name: 'chain_integrity_shift_events_ex_baseline',");
    expect(rawIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(rawIdx);
    expect(exIdx).toBeGreaterThan(filterIdx);
    // The raw record (insert block up to the filter declaration) must
    // not touch the baseline in any way.
    const rawBlock = src.slice(rawIdx, filterIdx);
    expect(rawBlock).toContain('mismatch_count: allMismatches.length');
    expect(rawBlock.includes('CHAIN_BASELINE_EVENT_IDS')).toBe(false);
    // Ex-baseline filters by the baseline set and records the exclusion count.
    const exBlock = src.slice(exIdx);
    expect(src).toContain('!CHAIN_BASELINE_EVENT_IDS.has(m.event_id)');
    expect(exBlock).toContain('baseline_excluded_count');
    expect(exBlock).toContain('baseline: { baseline_id: CHAIN_BASELINE_ID }');
    // Alert rows + email still keyed to the RAW mismatch set.
    expect(src).toContain('await writeAlertRows(supabase, allMismatches);');
  });
});
