// FLOSTRUCTION /command — Skeleton primitives.
// Used by route-level loading.tsx so the shell + a believable shape of
// the page paints instantly while the server component streams. Tasteful
// shimmer; reduced-motion respected (the shimmer is gated by the global
// `prefers-reduced-motion: reduce` rule in command-tokens.css).

import type { CSSProperties } from 'react';

interface Props {
  /** Pixel or % width. */
  width?: number | string;
  /** Pixel height. Defaults to a single line height. */
  height?: number | string;
  /** Radius — defaults to a small pill. */
  radius?: number | string;
  /** Inline style escape hatch. */
  style?: CSSProperties;
  /** Render multiple lines stacked. */
  lines?: number;
}

const shimmerStyle: CSSProperties = {
  background:
    'linear-gradient(90deg, var(--surface-sunken) 0%, var(--border) 50%, var(--surface-sunken) 100%)',
  backgroundSize: '200% 100%',
  animation: 'flos-skeleton 1.4s var(--ease) infinite',
};

export function Skeleton({ width = '100%', height = 14, radius = 6, style, lines }: Props) {
  if (lines && lines > 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              display: 'block',
              width: i === lines - 1 ? '60%' : width,
              height,
              borderRadius: radius,
              ...shimmerStyle,
            }}
          />
        ))}
        <style>{KEYFRAMES}</style>
      </div>
    );
  }
  return (
    <>
      <span
        aria-hidden
        style={{
          display: 'block',
          width,
          height,
          borderRadius: radius,
          ...shimmerStyle,
          ...style,
        }}
      />
      <style>{KEYFRAMES}</style>
    </>
  );
}

export function SkeletonTitle() {
  return <Skeleton width={260} height={36} radius={8} />;
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} height={14} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div
      aria-busy="true"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: 'var(--card-padding)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: height,
      }}
    >
      <Skeleton width={180} height={16} />
      <Skeleton width="80%" height={12} />
      <Skeleton width="55%" height={12} />
    </div>
  );
}

const KEYFRAMES = `
  @keyframes flos-skeleton {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    [style*="flos-skeleton"], span[aria-hidden] { animation: none !important; }
  }
`;
