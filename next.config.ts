import type { NextConfig } from 'next';

// Production build runs on webpack (`next build --webpack`) so Next applies
// per-request CSP nonces to its inline framework scripts — the Turbopack
// production build does NOT (vercel/next.js#93094), which blocked strict
// nonce-based CSP enforcement. Dev stays on Turbopack (`next dev --turbopack`).
//
// @serwist/next is intentionally NOT wired here: it is webpack-based and was
// parked (disable:true) during the Turbopack era, and its swSrc (src/app/sw.ts)
// was deleted. Wrapping the config with it breaks the real webpack build.
// Re-introduce a Turbopack-compatible service worker when offline support is
// scheduled (tracked: serwist/serwist#54).

const nextConfig: NextConfig = {
  // Best-in-class hardening: don't advertise the framework (info-disclosure).
  poweredByHeader: false,
};

export default nextConfig;
