import type { MetadataRoute } from 'next';

// Flostruction Field PWA manifest
// Workers install this on their phones for offline shift submission

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flostruction Field',
    short_name: 'Flostruction',
    description: 'Every hour flows. Every pay right.',
    start_url: '/field',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
