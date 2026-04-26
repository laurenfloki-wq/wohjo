import { describe, it, expect } from 'vitest';
import { generateEventHash, verifyHashChain } from './hash';

const BASE_EVENT = {
  company_id: 'comp-001',
  worker_id: 'worker-001',
  site_id: 'site-001',
  event_type: 'START_EVENT',
  event_data: { start_time: '2026-04-22T07:00:00.000Z' },
  created_at: new Date('2026-04-22T07:00:00.000Z'),
};

describe('generateEventHash', () => {
  it('returns a 64-char hex SHA-256 string', () => {
    const hash = generateEventHash(BASE_EVENT);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash(BASE_EVENT);
    expect(h1).toBe(h2);
  });

  it('changes when worker_id changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, worker_id: 'worker-002' });
    expect(h1).not.toBe(h2);
  });

  it('changes when event_type changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, event_type: 'END_EVENT' });
    expect(h1).not.toBe(h2);
  });

  it('changes when event_data changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, event_data: { start_time: '2026-04-22T08:00:00.000Z' } });
    expect(h1).not.toBe(h2);
  });

  it('changes when created_at changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, created_at: new Date('2026-04-22T07:00:01.000Z') });
    expect(h1).not.toBe(h2);
  });

  it('changes when site_id changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, site_id: 'site-002' });
    expect(h1).not.toBe(h2);
  });

  it('changes when company_id changes', () => {
    const h1 = generateEventHash(BASE_EVENT);
    const h2 = generateEventHash({ ...BASE_EVENT, company_id: 'comp-002' });
    expect(h1).not.toBe(h2);
  });

  // Joao test — the hash that never changes
  it('Joao test: hash is consistent for known input', () => {
    const joaoEvent = {
      company_id: 'wohjo-test-company',
      worker_id: 'wohjo-test-worker-joao',
      site_id: 'wohjo-test-site',
      event_type: 'START_EVENT',
      event_data: { start_time: '2026-04-22T07:00:00.000Z', shift_date: '2026-04-22' },
      created_at: new Date('2026-04-22T07:00:00.000Z'),
    };
    const hash = generateEventHash(joaoEvent);
    // Hash must be a valid SHA-256, deterministic
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Verify it's the same every time
    expect(generateEventHash(joaoEvent)).toBe(hash);
  });
});

describe('verifyHashChain', () => {
  function makeEvent(overrides: {
    id: string;
    event_type: string;
    event_data?: Record<string, unknown>;
    created_at?: Date;
    previous_event_hash?: string | null;
  }) {
    const created_at = overrides.created_at ?? new Date('2026-04-22T07:00:00.000Z');
    const event_data = overrides.event_data ?? {};
    const hash = generateEventHash({
      company_id: 'comp-001',
      worker_id: 'worker-001',
      site_id: 'site-001',
      event_type: overrides.event_type,
      event_data,
      created_at,
    });
    return {
      id: overrides.id,
      company_id: 'comp-001',
      worker_id: 'worker-001',
      site_id: 'site-001',
      event_type: overrides.event_type,
      event_data,
      created_at,
      event_hash: hash,
      previous_event_hash: overrides.previous_event_hash ?? null,
    };
  }

  it('returns true for empty array', () => {
    expect(verifyHashChain([])).toBe(true);
  });

  it('returns true for a single valid event with null previous_event_hash', () => {
    const event = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: null });
    expect(verifyHashChain([event])).toBe(true);
  });

  it('returns true if first event has "GENESIS" as previous_event_hash', () => {
    const event = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: 'GENESIS' });
    expect(verifyHashChain([event])).toBe(true);
  });

  it('returns false if first event has an arbitrary non-null/non-GENESIS previous_event_hash', () => {
    const event = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: 'some-hash' });
    expect(verifyHashChain([event])).toBe(false);
  });

  it('returns true for a valid 2-event chain', () => {
    const e1 = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: null });
    const e2 = makeEvent({ id: 'e2', event_type: 'END_EVENT', previous_event_hash: e1.event_hash, created_at: new Date('2026-04-22T15:30:00.000Z'), event_data: { end_time: '2026-04-22T15:30:00.000Z' } });
    expect(verifyHashChain([e1, e2])).toBe(true);
  });

  it('returns false if chain is broken — wrong previous_event_hash', () => {
    const e1 = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: null });
    const e2 = makeEvent({ id: 'e2', event_type: 'END_EVENT', previous_event_hash: 'wrong-hash', created_at: new Date('2026-04-22T15:30:00.000Z') });
    expect(verifyHashChain([e1, e2])).toBe(false);
  });

  it('returns false if event_hash has been tampered with', () => {
    const e1 = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: null });
    const tampered = { ...e1, event_hash: 'a'.repeat(64) };
    expect(verifyHashChain([tampered])).toBe(false);
  });

  it('returns true for a valid 3-event chain (Joao full shift)', () => {
    const e1 = makeEvent({ id: 'e1', event_type: 'START_EVENT', previous_event_hash: null, event_data: { start_time: '2026-04-22T07:00:00.000Z' } });
    const e2 = makeEvent({ id: 'e2', event_type: 'END_EVENT', previous_event_hash: e1.event_hash, created_at: new Date('2026-04-22T15:30:00.000Z'), event_data: { end_time: '2026-04-22T15:30:00.000Z', break_minutes: 30 } });
    const e3 = makeEvent({ id: 'e3', event_type: 'SHIFT_COMMIT', previous_event_hash: e2.event_hash, created_at: new Date('2026-04-22T15:31:00.000Z'), event_data: { total_hours: '8.00' } });
    expect(verifyHashChain([e1, e2, e3])).toBe(true);
  });
});
