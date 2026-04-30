import type { MetadataRoute } from 'next';

// FLOSTRUCTION Field PWA manifest.
// Workers install this on their phones for offline shift submission.
//
// 2026-04-30 brand-polish update: PNG icons (icon-192.png, icon-512.png)
// referenced by the prior version DID NOT EXIST in /public, leaving the
// PWA install with broken icon references. Replaced with a single
// scalable SVG (`/icon.svg`) carrying the brand-suite v3 F-mark.
// Modern PWA installers (Chrome/Edge/Android Chrome on Android 12+ /
// iOS Safari Add-to-Home-Screen) all support SVG icons; the SVG also
// renders crisp at any DPR and at any home-screen mask size.
//
// Browser-tab favicon and Apple touch icon are handled separately
// via Next.js App Router icon convention at:
//   - src/app/icon.tsx          (32×32, browser tab)
//   - src/app/apple-icon.tsx    (180×180, iOS home screen)
// Both render via ImageResponse at build time, so the served URL is
// stable and the F-mark renders consistently across browsers.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flostruction Field',
    short_name: 'Flostruction',
    description: 'Every hour flows. Every pay right.',
    start_url: '/field',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F5F0E8',
    theme_color: '#0E1C2F',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
