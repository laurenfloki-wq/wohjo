// Flostruction Field — service worker (audit 2026-07-02).
//
// Scope: /field. Purpose: keep the worker app usable on construction
// sites with unreliable connectivity.
//   - navigations under /field: network-first, falling back to the
//     designed offline page when there is no connection
//   - immutable build assets (/_next/static, /brand): cache-first
//   - NEVER touches /api/*, non-GET requests, or cross-origin requests —
//     shift events and auth always go to the network, preserving WLES
//     evidentiary semantics unchanged.
//
// Note: @serwist/next remains parked (Turbopack conflict — see
// next.config.ts). This worker is hand-rolled and bundler-independent.

const VERSION = 'field-sw-v2';
const OFFLINE_URL = '/field/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate' && url.pathname.startsWith('/field')) {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});

// Background Sync (progressive enhancement, Decision 2026-07-02): when the
// browser grants a 'flos-replay' sync, wake any open field pages so the
// offline queue replays even if the app was backgrounded when signal
// returned. Pages remain the replay executor — the SW never sends shift
// data itself.
self.addEventListener('sync', (event) => {
  if (event.tag === 'flos-replay') {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: 'flos-replay' }))),
    );
  }
});
