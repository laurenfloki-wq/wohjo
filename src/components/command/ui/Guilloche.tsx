// FLOSTRUCTION /command — Guilloché.
//
// Restrained security-print rosette computed parametrically from a
// SHA-256 hex string. The rosette is a hypotrochoid traced once into a
// monochrome SVG <path>; the parameters (inner/outer ring ratio, pen
// offset, rotation, line count, line opacity) are seeded from bytes of
// the hex so every hash yields a distinct engraving and the same hash
// always yields the SAME engraving — the visual is a deterministic
// function of the cryptographic fingerprint.
//
// Guardrails:
//   - Monochrome, fixed --ink colour with very low alpha — never used
//     to convey state.
//   - Pure SVG path data (no animation, no canvas); the path is
//     useMemo'd so re-renders never recompute.
//   - prefers-reduced-motion: the engraving is static — nothing to opt
//     out of, but the surrounding component uses no transitions either.
//   - Never load-bearing: callers always render their own copy/seal
//     content on top; the rosette sits behind.

'use client';

import { useMemo, useId } from 'react';
import { rosettePathFromSeed } from '@/lib/guilloche';

interface Props {
  /** Seed string — any hex string; SHA-256 (64 hex chars) is ideal. */
  seed: string | null | undefined;
  /** Pixel size of the rendered SVG (square). */
  size: number;
  /** Opacity of the rosette path. Keep low (0.04–0.12). */
  opacity?: number;
  /** Stroke colour. Defaults to var(--ink). */
  stroke?: string;
  /** Stroke width. Hairline default. */
  strokeWidth?: number;
  /** Class for positioning the SVG (absolute inside a relative parent). */
  className?: string;
}

export function Guilloche({
  seed,
  size,
  opacity = 0.08,
  stroke = 'var(--ink)',
  strokeWidth = 0.5,
  className,
}: Props) {
  const id = useId();
  const path = useMemo(
    () => rosettePathFromSeed(seed, size / 2, size / 2, size / 2 - 6),
    [seed, size],
  );
  if (!seed || !path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="presentation"
      aria-hidden
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        <clipPath id={`flos-gc-clip-${id}`}>
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} />
        </clipPath>
      </defs>
      <g clipPath={`url(#flos-gc-clip-${id})`}>
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/**
 * Slim watermark variant — same engine, constrained to a thin band
 * with a soft horizontal mask so the rosette fades at the edges.
 */
export function GuillocheBand({
  seed,
  width,
  height,
  opacity = 0.05,
  stroke = 'var(--ink)',
  orientation = 'horizontal',
}: {
  seed: string | null | undefined;
  width: number;
  height: number;
  opacity?: number;
  stroke?: string;
  /**
   * 'horizontal' fades left/right (wide band). 'vertical' fades top/bottom —
   * use for a tall margin strip beside legible text so the rosette never
   * sits under the type (which read as noise when squashed behind it).
   */
  orientation?: 'horizontal' | 'vertical';
}) {
  const id = useId();
  // Seed the rosette on the SHORT edge so it renders at its natural
  // (unsquashed) scale, then gently extend it along the long edge. Fewer
  // segments → a cleaner engraving that doesn't alias into moiré.
  const baseSize = Math.min(width, height);
  const path = useMemo(
    () => rosettePathFromSeed(seed, baseSize / 2, baseSize / 2, baseSize / 2 - 4, 96),
    [seed, baseSize],
  );
  if (!seed || !path) return null;
  const vertical = orientation === 'vertical';
  // Stretch modestly along the long edge (cap 1.6×) so it reads as a
  // continuous engraved ribbon, never a bunched-up knot.
  const stretch = Math.min(1.6, Math.max(width, height) / baseSize);
  const sx = vertical ? 1 : stretch;
  const sy = vertical ? stretch : 1;
  const fade = vertical
    ? { x1: '0', x2: '0', y1: '0', y2: '1' }
    : { x1: '0', x2: '1', y1: '0', y2: '0' };
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="presentation"
      aria-hidden
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={`flos-gc-band-fade-${id}`} {...fade}>
          <stop offset="0%" stopColor="white" stopOpacity={0} />
          <stop offset="22%" stopColor="white" stopOpacity={1} />
          <stop offset="78%" stopColor="white" stopOpacity={1} />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </linearGradient>
        <mask id={`flos-gc-band-mask-${id}`}>
          <rect width={width} height={height} fill={`url(#flos-gc-band-fade-${id})`} />
        </mask>
      </defs>
      <g mask={`url(#flos-gc-band-mask-${id})`}>
        <g
          transform={`translate(${width / 2}, ${height / 2}) scale(${sx} ${sy}) translate(${-baseSize / 2}, ${-baseSize / 2})`}
        >
          <path
            d={path}
            fill="none"
            stroke={stroke}
            strokeWidth={0.6}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
    </svg>
  );
}
