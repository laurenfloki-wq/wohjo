'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  enqueueAction,
  syncQueue,
  hasPendingActions,
  isOnline as checkOnline,
  type OfflineShiftAction,
} from './queue';

interface UseOfflineSyncReturn {
  isOnline: boolean;
  pendingSync: boolean;
  syncNow: () => Promise<void>;
  queueShiftStart: (workerId: string, payload: Record<string, unknown>) => OfflineShiftAction;
  lastSyncResult: { synced: number; failed: number } | null;
}

export function useOfflineSync(): UseOfflineSyncReturn {
  const [isOnlineState, setIsOnlineState] = useState(true);
  const [pendingSync, setPendingSync] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  // Monitor connectivity
  useEffect(() => {
    setIsOnlineState(checkOnline());
    setPendingSync(hasPendingActions());

    const handleOnline = () => {
      setIsOnlineState(true);
      // Auto-sync when coming back online
      void syncPending();
    };
    const handleOffline = () => setIsOnlineState(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncPending = useCallback(async () => {
    if (!checkOnline() || !hasPendingActions()) return;
    setPendingSync(true);
    const result = await syncQueue();
    setLastSyncResult(result);
    setPendingSync(hasPendingActions());
  }, []);

  const syncNow = useCallback(async () => {
    await syncPending();
  }, [syncPending]);

  const queueShiftStart = useCallback((workerId: string, payload: Record<string, unknown>): OfflineShiftAction => {
    const action = enqueueAction('SHIFT_START', workerId, payload);
    setPendingSync(true);
    return action;
  }, []);

  return {
    isOnline: isOnlineState,
    pendingSync,
    syncNow,
    queueShiftStart,
    lastSyncResult,
  };
}
