import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

// WOHJO PARKING LOT: @serwist/next uses webpack; Next.js 16 defaults to Turbopack.
// Serwist is disabled until @serwist/next supports Turbopack (tracked:
// https://github.com/serwist/serwist/issues/54). Re-enable before pilot or post-pilot.
// For now: disable: true keeps the build clean; turbopack: {} silences the webpack conflict.
// NOTE: src/app/sw.ts was deleted — TypeScript was checking it during the Turbopack build
// and its ServiceWorkerGlobalScope globals caused a build failure. Recreate when re-enabling.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  scope: '/field',
  disable: true, // Disabled: Next.js 16 Turbopack + @serwist/next webpack conflict
});

const nextConfig: NextConfig = {
  turbopack: {}, // Explicit Turbopack opt-in — silences webpack-config conflict error
  // Best-in-class hardening: don't advertise the framework (info-disclosure).
  poweredByHeader: false,
  // pdfkit (Evidence Pack PDF) reads its standard-font .afm metrics via a
  // dynamic fs path the bundler can't follow. Keep it external so it's
  // required from node_modules at runtime, and pin the data dir for the
  // serverless trace so the fonts ship with the evidence route.
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    '/api/command/payruns/[exportId]/evidence': ['./node_modules/pdfkit/js/data/**/*'],
  },
};

export default withSerwist(nextConfig);
