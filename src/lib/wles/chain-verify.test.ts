import { describe, expect, it } from 'vitest';
import { generateEventHash } from './hash';
import { verifyCompanyChain, type ShiftEventRow } from './chain-verify';

function build(
  index: number,
  previous_event_hash: string | null,
  overrides: Partial<ShiftEventRow> = {},
): ShiftEventRow {
  const companyId = '00000000-0000-0000-0000-000000000001';
  const workerId = '00000000-0000-0000-0000-000000000002';
  const siteId = '00000000-0000-0000-0000-000000000003';
  const created_at = new Date(`2026-04-21T07:${String(index).padStart(2, '0')}:00.000Z`);
  const event_type = 'START_EVENT';
  const event_data = { note: `evt-${index}` };
  const event_hash = generateEventHash({
    company_id: companyId,
    worker_id: workerId,
    site_id: siteId,
    event_type,
    event_data,
    created_at,
  });
  return {
    id: `11111111-1111-1111-1111-${String(index).padStart(12, '0')}`,
    company_id: companyId,
    worker_id: workerId,
    site_id: siteId,
    event_type,
    event_data,
    event_hash,
    previous_event_hash,
    created_at,
    ...overrides,
  };
}

describe('verifyCompanyChain', () => {
  it('returns ok for an empty chain', () => {
    const r = verifyCompanyChain([]);
    expect(r.ok).toBe(true);
    expect(r.events_scanned).toBe(0);
    expect(r.mismatches).toHaveLength(0);
  });

  it('returns ok for a valid 5-event chain with null genesis', () => {
    const e0 = build(0, null);
    const e1 = build(1, e0.event_hash);
    const e2 = build(2, e1.event_hash);
    const e3 = build(3, e2.event_hash);
    const e4 = build(4, e3.event_hash);
    const r = verifyCompanyChain([e0, e1, e2, e3, e4]);
    expect(r.ok).toBe(true);
    expect(r.events_scanned).toBe(5);
    expect(r.mismatches).toHaveLength(0);
  });

  it('accepts "GENESIS" as a valid genesis marker', () => {
    const e0 = build(0, 'GENESIS');
    const e1 = build(1, e0.event_hash);
    const r = verifyCompanyChain([e0, e1]);
    expect(r.ok).toBe(true);
  });

  it('flags GENESIS_LINK_INVALID when the first event has a non-null non-GENESIS previous', () => {
    const e0 = build(0, 'deadbeef');
    const r = verifyCompanyChain([e0]);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0].reason).toBe('GENESIS_LINK_INVALID');
  });

  it('flags SELF_HASH_MISMATCH when a stored hash does not match its content', () => {
    const e0 = build(0, null);
    const e1 = build(1, e0.event_hash);
    const tampered: ShiftEventRow = { ...e1, event_hash: 'cafebabe' };
    const r = verifyCompanyChain([e0, tampered]);
    expect(r.ok).toBe(false);
    const selfMismatches = r.mismatches.filter((m) => m.reason === 'SELF_HASH_MISMATCH');
    expect(selfMismatches).toHaveLength(1);
    expect(selfMismatches[0].event_id).toBe(tampered.id);
    expect(selfMismatches[0].actual).toBe('cafebabe');
    expect(selfMismatches[0].expected).toBe(e1.event_hash);
  });

  it('flags PREVIOUS_LINK_BROKEN when an event points to the wrong prior hash', () => {
    const e0 = build(0, null);
    const e1 = build(1, e0.event_hash);
    const e2Wrong: ShiftEventRow = build(2, 'not-the-right-prev');
    const r = verifyCompanyChain([e0, e1, e2Wrong]);
    expect(r.ok).toBe(false);
    const linkMismatches = r.mismatches.filter((m) => m.reason === 'PREVIOUS_LINK_BROKEN');
    expect(linkMismatches).toHaveLength(1);
    expect(linkMismatches[0].event_id).toBe(e2Wrong.id);
    expect(linkMismatches[0].expected).toBe(e1.event_hash);
  });

  it('reports multiple independent mismatches in one pass (does not short-circuit)', () => {
    const e0 = build(0, null);
    const e1 = build(1, e0.event_hash);
    const e2 = build(2, e1.event_hash);
    const e1Tampered: ShiftEventRow = { ...e1, event_hash: 'zzz' };
    const e2Tampered: ShiftEventRow = { ...e2, previous_event_hash: 'qqq' };
    const r = verifyCompanyChain([e0, e1Tampered, e2Tampered]);
    expect(r.ok).toBe(false);
    // Tampering e1 creates SELF_HASH_MISMATCH on e1 AND PREVIOUS_LINK_BROKEN on e2
    // (since e2's stored previous 'qqq' != prior event's actual stored 'zzz').
    expect(r.mismatches.length).toBeGreaterThanOrEqual(2);
    expect(r.mismatches.map((m) => m.reason)).toContain('SELF_HASH_MISMATCH');
    expect(r.mismatches.map((m) => m.reason)).toContain('PREVIOUS_LINK_BROKEN');
  });
});
