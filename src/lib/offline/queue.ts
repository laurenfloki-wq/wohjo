// Flosmosis Offline Queue
// Stores shift actions in localStorage when offline, syncs when connectivity returns.
// Non-negotiable: offline queue is informational. Final record is always server-authoritative.

const QUEUE_KEY = 'wohjo_offline_queue';

export interface OfflineShiftAction {
  id: string;
  type: 'SHIFT_START' | 'SHIFT_END';
  worker_id: string;
  timestamp: string;           // ISO 8601 — captured at action time
  payload: Record<string, unknown>;
  retries: number;
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  created_at: string;
}

function generateOfflineId(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = 'offline-';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function getQueue(): OfflineShiftAction[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineShiftAction[];
  } catch {
    return [];
  }
}

function saveQueue(queue: OfflineShiftAction[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueAction(
  type: OfflineShiftAction['type'],
  worker_id: string,
  payload: Record<string, unknown>,
): OfflineShiftAction {
  // P7-C1 — stamp the payload with a stable client_event_id at queue
  // time. Subsequent retries (network drop, app kill, service worker
  // resync) MUST send the same UUID so the server's partial unique
  // index uq_shift_events_client_event_id deduplicates them to
  // exactly one sealed event. Generated once here; never overwritten.
  const stableUuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : undefined;
  const stampedPayload =
    stableUuid && payload.client_event_id === undefined
      ? { ...payload, client_event_id: stableUuid }
      : payload;
  const action: OfflineShiftAction = {
    id: generateOfflineId(),
    type,
    worker_id,
    timestamp: new Date().toISOString(),
    payload: stampedPayload,
    retries: 0,
    status: 'PENDING',
    created_at: new Date().toISOString(),
  };
  const queue = getQueue();
  queue.push(action);
  saveQueue(queue);
  return action;
}

export function updateActionStatus(id: string, status: OfflineShiftAction['status']): void {
  const queue = getQueue();
  const idx = queue.findIndex(a => a.id === id);
  if (idx >= 0) {
    queue[idx].status = status;
    queue[idx].retries += status === 'SYNCING' ? 1 : 0;
    saveQueue(queue);
  }
}

export function removeAction(id: string): void {
  const queue = getQueue().filter(a => a.id !== id);
  saveQueue(queue);
}

export function getPendingActions(): OfflineShiftAction[] {
  return getQueue().filter(a => a.status === 'PENDING' || a.status === 'FAILED');
}

export function hasPendingActions(): boolean {
  return getPendingActions().length > 0;
}

// Sync all pending actions to the server
export async function syncQueue(
  onActionSynced?: (action: OfflineShiftAction, result: { success: boolean; data?: Record<string, unknown>; error?: string }) => void,
): Promise<{ synced: number; failed: number }> {
  const pending = getPendingActions();
  let synced = 0;
  let failed = 0;

  for (const action of pending) {
    updateActionStatus(action.id, 'SYNCING');

    try {
      const endpoint = action.type === 'SHIFT_START'
        ? '/api/field/shift/start'
        : '/api/field/shift/end';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...action.payload,
          worker_id: action.worker_id,
          offline_timestamp: action.timestamp,
        }),
      });

      const data = await res.json() as Record<string, unknown>;

      if (res.ok) {
        removeAction(action.id);
        synced++;
        onActionSynced?.(action, { success: true, data });
      } else if (res.status === 409) {
        // Duplicate — already recorded. Remove from queue.
        removeAction(action.id);
        synced++;
        onActionSynced?.(action, { success: true, data });
      } else {
        updateActionStatus(action.id, 'FAILED');
        failed++;
        onActionSynced?.(action, { success: false, error: data.error as string ?? 'Unknown error' });
      }
    } catch {
      updateActionStatus(action.id, 'FAILED');
      failed++;
      onActionSynced?.(action, { success: false, error: 'Network error' });
    }
  }

  return { synced, failed };
}

// Check if online
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
