// Registers the /field service worker, runs the offline-queue lifecycle,
// and shows the connection banner. Audit 2026-07-02 + Decision 2026-07-02
// (Option 1 dual-time offline capture). Everything here is best-effort:
// any failure leaves the app exactly as it was before this component.
'use client';

import { useEffect, useRef, useState } from 'react';
import { pendingCount, replayQueued, QUEUE_CHANGED_EVENT } from '@/lib/field/offline-queue';

export default function FieldServiceWorker() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const hadPending = useRef(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/field-sw.js', { scope: '/field' }).catch(() => {
        /* best-effort — never disrupt the app */
      });
      navigator.serviceWorker.addEventListener('message', (event) => {
        if ((event.data as { type?: string } | null)?.type === 'flos-replay') {
          void replayQueued();
        }
      });
    }

    const onQueueChanged = (event: Event) => {
      const remaining = (event as CustomEvent<{ remaining: number }>).detail?.remaining ?? 0;
      setPending(remaining);
      if (remaining > 0) {
        hadPending.current = true;
      } else if (hadPending.current) {
        // The queue just drained: sealed truth has replaced on-device
        // intent. Refresh so the page reflects the sealed state.
        hadPending.current = false;
        if (window.location.pathname.startsWith('/field')) {
          window.location.reload();
        }
      }
    };
    const goOnline = () => {
      setOffline(false);
      void replayQueued();
    };
    const goOffline = () => setOffline(true);

    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    void pendingCount().then((n) => {
      setPending(n);
      if (n > 0) {
        hadPending.current = true;
        if (navigator.onLine) void replayQueued();
      }
    });

    window.addEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, onQueueChanged);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline && pending === 0) return null;

  const message = offline
    ? pending > 0
      ? `You're offline — ${pending} record${pending === 1 ? '' : 's'} saved on this device. ${pending === 1 ? 'It' : 'They'} will seal automatically when your signal returns.`
      : "You're offline. Recording hours needs a connection — this will clear automatically when your signal returns."
    : `Signal's back — sealing ${pending} queued record${pending === 1 ? '' : 's'}…`;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: '#D9A548',
        color: '#0F0F10',
        padding: '10px 16px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      {message}
    </div>
  );
}
