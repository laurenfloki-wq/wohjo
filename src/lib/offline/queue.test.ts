// P7-C1 — offline queue client_event_id stamping
//
// The partial unique index uq_shift_events_client_event_id provides
// retry-safe semantics ONLY if the SAME UUID is sent on every retry.
// The offline queue is the natural place to anchor that UUID:
// generated once at enqueue time, persisted in localStorage, sent
// verbatim on every retry attempt.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueAction, getQueue } from './queue';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  // Fresh in-memory localStorage for each test so queue state doesn't
  // leak between cases.
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('enqueueAction — P7-C1 client_event_id stamping', () => {
  it('stamps a UUID into the payload when none is supplied', () => {
    const action = enqueueAction('SHIFT_START', 'worker-1', { site_id: 's-1' });
    expect(action.payload.client_event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('respects a caller-supplied client_event_id (does not overwrite)', () => {
    const supplied = 'abcdef01-2345-6789-abcd-ef0123456789';
    const action = enqueueAction('SHIFT_START', 'worker-1', {
      site_id: 's-1',
      client_event_id: supplied,
    });
    expect(action.payload.client_event_id).toBe(supplied);
  });

  it('the UUID is persisted to the queue (survives a re-read)', () => {
    const action = enqueueAction('SHIFT_END', 'worker-1', { break_minutes: 30 });
    const queue = getQueue();
    const found = queue.find((a) => a.id === action.id);
    expect(found?.payload.client_event_id).toBe(
      action.payload.client_event_id,
    );
  });

  it('two enqueues for the same worker produce different UUIDs', () => {
    const a = enqueueAction('SHIFT_START', 'worker-1', { site_id: 's-1' });
    const b = enqueueAction('SHIFT_START', 'worker-1', { site_id: 's-1' });
    expect(a.payload.client_event_id).not.toBe(b.payload.client_event_id);
  });
});
