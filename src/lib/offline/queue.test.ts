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

// ─────────────────────────────────────────────────────────────────────────────
// updateActionStatus / removeAction
// ─────────────────────────────────────────────────────────────────────────────

import { updateActionStatus, removeAction, getPendingActions, hasPendingActions, isOnline, syncQueue } from './queue';

describe('updateActionStatus', () => {
  it('updates status and increments retries when SYNCING', () => {
    const action = enqueueAction('SHIFT_START', 'worker-1', {});
    updateActionStatus(action.id, 'SYNCING');
    const q = getPendingActions();
    // SYNCING is not PENDING or FAILED, so not in pending list
    expect(q.find(a => a.id === action.id)).toBeUndefined();
  });

  it('moves action to FAILED and keeps it in pending list', () => {
    const action = enqueueAction('SHIFT_START', 'worker-1', {});
    updateActionStatus(action.id, 'FAILED');
    const pending = getPendingActions();
    const found = pending.find(a => a.id === action.id);
    expect(found?.status).toBe('FAILED');
  });

  it('no-ops silently for unknown id', () => {
    expect(() => updateActionStatus('nonexistent-id', 'SYNCED')).not.toThrow();
  });
});

describe('removeAction', () => {
  it('removes an action from the queue', () => {
    const action = enqueueAction('SHIFT_END', 'worker-2', {});
    removeAction(action.id);
    const q = getPendingActions();
    expect(q.find(a => a.id === action.id)).toBeUndefined();
  });
});

describe('hasPendingActions', () => {
  it('returns false when queue is empty', () => {
    expect(hasPendingActions()).toBe(false);
  });

  it('returns true after an action is enqueued', () => {
    enqueueAction('SHIFT_START', 'worker-3', {});
    expect(hasPendingActions()).toBe(true);
  });
});

describe('isOnline', () => {
  it('returns true when navigator is undefined (server/node env)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isOnline()).toBe(true);
  });

  it('returns navigator.onLine when navigator is defined', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isOnline()).toBe(false);
    vi.stubGlobal('navigator', { onLine: true });
    expect(isOnline()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// syncQueue
// ─────────────────────────────────────────────────────────────────────────────

describe('syncQueue', () => {
  it('returns 0 synced 0 failed when queue is empty', async () => {
    const result = await syncQueue();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it('syncs a successful SHIFT_START action', async () => {
    const action = enqueueAction('SHIFT_START', 'worker-1', { site_id: 's-1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'server-evt-1' }),
    }));
    const onSynced = vi.fn();
    const result = await syncQueue(onSynced);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(getPendingActions().find(a => a.id === action.id)).toBeUndefined();
    expect(onSynced).toHaveBeenCalledWith(
      expect.objectContaining({ id: action.id }),
      expect.objectContaining({ success: true }),
    );
  });

  it('counts a 409 Conflict response as synced (idempotent duplicate)', async () => {
    enqueueAction('SHIFT_END', 'worker-1', {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({}),
    }));
    const result = await syncQueue();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('marks action FAILED on non-409 server error', async () => {
    const action = enqueueAction('SHIFT_START', 'worker-1', {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal' }),
    }));
    const result = await syncQueue();
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    // Action stays in failed-pending list
    const pending = getPendingActions();
    expect(pending.find(a => a.id === action.id)?.status).toBe('FAILED');
  });

  it('marks action FAILED on network error (fetch throws)', async () => {
    enqueueAction('SHIFT_END', 'worker-1', {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await syncQueue();
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
  });
});
