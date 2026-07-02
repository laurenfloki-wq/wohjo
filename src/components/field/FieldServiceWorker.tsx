// Registers the /field service worker and shows a connection banner.
// Audit 2026-07-02. Registration is best-effort: any failure leaves the
// app exactly as it was before this component existed.
'use client';

import { useEffect, useState } from 'react';

export default function FieldServiceWorker() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/field-sw.js', { scope: '/field' }).catch(() => {
        /* best-effort — never disrupt the app */
      });
    }
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;
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
      You&rsquo;re offline. Recording hours needs a connection — this will clear automatically when your signal returns.
    </div>
  );
}
