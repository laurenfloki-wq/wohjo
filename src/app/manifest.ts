import type { MetadataRoute } from 'next';

// FLOSTRUCTION Field PWA manifest.
// Workers install this on their phones for offline shift submission.
//
// 2026-06-25 (W3): real raster install tiles on the charcoal source-logo
// ground. The three-bar woven F-mark (public/brand/f-mark-three-bar.svg,
// rebuilt from the source JPGs) is rendered to PNG at 192/512 + a maskable
// 512 (mark shrunk into the safe area so Android's adaptive mask can't clip
// the diagonals) via the ImageResponse route at /api/pwa-icon. The scalable
// SVG stays as an extra `any` entry for installers that prefer vector.
//
// Browser-tab favicon and Apple touch icon are handled separately via the
// Next.js App Router icon convention:
//   - src/app/icon.tsx          (32×32, browser tab — cream F-mark)
//   - src/app/apple-icon.tsx    (180×180, iOS home screen — charcoal tile)
// Both render via ImageResponse at build time, so the served URL is stable.

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
        src: '/api/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/api/pwa-icon?size=512&maskable=1',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        // Scalable vector fallback for installers that prefer it.
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
