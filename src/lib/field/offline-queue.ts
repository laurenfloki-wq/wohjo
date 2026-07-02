// Offline shift-event queue — client side (Decision 2026-07-02, Option 1).
//
// When the field app cannot reach the network, clock-on / clock-off
// submissions are stored in IndexedDB with their device capture time and
// replayed when connectivity returns. Replays send the ORIGINAL request
// body plus an `offline: { captured_at, client_now }` block; the server
// measures clock skew, records the dual-time extension metadata, and the
// existing client_event_id unique indexes make every replay idempotent.
//
// Nothing here touches WLES sealing — the server remains the only place
// a record is sealed.

export interface QueuedShiftEvent {
  id: string;
  kind: 'start' | 'end';
  body: Record<string, unknown>;
  captured_at: string;
  queued_at: string;
}

const DB_NAME = 'flostruction-field';
const STORE = 'queued-shift-events';
export const QUEUE_CHANGED_EVENT = 'flos-queue-changed';

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

function emitQueueChanged(remaining: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT, { detail: { remaining } }));
  }
}

export async function pendingCount(): Promise<number> {
  if (!hasIndexedDb()) return 0;
  try {
    return await tx('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

export async function enqueueShiftEvent(
  kind: 'start' | 'end',
  body: Record<string, unknown>,
  capturedAt: string,
): Promise<void> {
  if (!hasIndexedDb()) throw new Error('offline queue unavailable');
  const id = typeof body.client_event_id === 'string' ? body.client_event_id : capturedAt;
  const item: QueuedShiftEvent = {
    id,
    kind,
    body,
    captured_at: capturedAt,
    queued_at: new Date().toISOString(),
  };
  await tx('readwrite', (s) => s.put(item));
  emitQueueChanged(await pendingCount());
}

let replaying = false;

/**
 * Replay every queued event. Removal policy:
 *   - 2xx or 409 (duplicate-day / idempotent replay): remove — the server
 *     holds the truth for this record now.
 *   - other 4xx except 401: remove and warn — retrying a rejected request
 *     forever is worse than surfacing it.
 *   - 401, 5xx, network failure: keep — retried on the next replay.
 */
export async function replayQueued(): Promise<{ sent: number; remaining: number }> {
  if (!hasIndexedDb() || replaying) {
    return { sent: 0, remaining: await pendingCount() };
  }
  replaying = true;
  let sent = 0;
  try {
    const items = (await tx('readonly', (s) => s.getAll())) as QueuedShiftEvent[];
    for (const item of items) {
      try {
        const res = await fetch(`/api/field/shift/${item.kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...item.body,
            offline: { captured_at: item.captured_at, client_now: new Date().toISOString() },
          }),
        });
        if (res.ok || res.status === 409) {
          await tx('readwrite', (s) => s.delete(item.id));
          sent++;
        } else if (res.status !== 401 && res.status >= 400 && res.status < 500) {
          console.warn('flos offline queue: server rejected queued record', item.kind, res.status);
          await tx('readwrite', (s) => s.delete(item.id));
        }
        // 401 / 5xx: keep for the next replay.
      } catch {
        // Network failed again — keep everything and stop this pass.
        break;
      }
    }
  } finally {
    replaying = false;
  }
  const remaining = await pendingCount();
  emitQueueChanged(remaining);
  return { sent, remaining };
}

/** Progressive enhancement: ask the SW to wake us for a replay. */
export async function tryRegisterBackgroundSync(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      await reg.sync?.register('flos-replay');
    }
  } catch {
    // Best-effort only — the 'online' listener remains the primary path.
  }
}
