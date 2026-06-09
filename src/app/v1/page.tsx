import type { Metadata } from 'next';
import LandingPageV1 from '@/components/shared/LandingPageV1';

// Archived pre-makeover landing page, frozen for old-vs-new comparison
// on the preview deploy. The live makeover renders at "/"; this route
// is a temporary comparison aid and is excluded from indexing. Remove
// once the makeover is merged.
export const metadata: Metadata = {
  title: 'FLOSTRUCTION — landing (v1, archived)',
  robots: { index: false, follow: false },
};

export default function V1Page() {
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 8,
          left: 8,
          zIndex: 9999,
          background: 'rgba(14,12,9,0.85)',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '5px 10px',
          borderRadius: 6,
          pointerEvents: 'none',
        }}
      >
        v1 · archived
      </div>
      <LandingPageV1 />
    </>
  );
}
