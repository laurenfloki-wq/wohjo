// FLOSTRUCTION /command — Chip primitive.
//
// THE single source of truth for any pill-shaped status/action label
// in the /command surface. StatusChip and SealChip are thin wrappers
// over this — both render the exact same element with the exact same
// geometry, so any two chips sit pixel-identical on one baseline.
//
// Geometry locked here:
//   - fixed height (no content can grow it)
//   - same vertical padding / font-size / radius
//   - lineHeight 1 so the cap-height drives the centre, not the leading
//   - box-sizing border-box so the 1px border doesn't push the height
//   - display inline-flex + align-items center so any children
//     (icons, mono codes) vertically centre INSIDE the fixed height

import type { CSSProperties, ReactNode } from 'react';
import { forwardRef } from 'react';

export type ChipSize = 'sm' | 'md';

export const CHIP_GEOMETRY: Record<ChipSize, {
  height: number;
  padding: string;
  fontSize: number;
  iconSize: number;
}> = {
  sm: { height: 24, padding: '0 10px', fontSize: 11, iconSize: 11 },
  md: { height: 28, padding: '0 12px', fontSize: 12, iconSize: 12 },
};

interface ChipProps {
  /** Background fill colour token. */
  bg: string;
  /** Foreground (text + icon) token. */
  fg: string;
  /** Border colour token. */
  border: string;
  size?: ChipSize | undefined;
  children: ReactNode;
  /** If set, renders as a real <button>; otherwise renders as <span>. */
  onClick?: (() => void) | undefined;
  ariaLabel?: string | undefined;
  /** Extra inline style for one-off positioning (NOT geometry). */
  style?: CSSProperties | undefined;
  /** Pass-through HTML data attributes (e.g. data-kind). */
  dataAttrs?: Record<string, string | undefined> | undefined;
}

export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  { bg, fg, border, size = 'md', children, onClick, ariaLabel, style, dataAttrs },
  ref,
) {
  const g = CHIP_GEOMETRY[size];
  const baseStyle: CSSProperties = {
    /* GEOMETRY — locked. Do not override per-instance. */
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: g.height,
    padding: g.padding,
    boxSizing: 'border-box',
    borderRadius: 9999,
    border: `1px solid ${border}`,
    background: bg,
    color: fg,
    fontFamily: 'var(--font-sans)',
    fontSize: g.fontSize,
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    fontVariantNumeric: 'tabular-nums lining-nums',
    /* Reset UA button noise so <button> renders identically to <span>. */
    margin: 0,
    cursor: onClick ? 'pointer' : 'default',
    textAlign: 'left',
    appearance: 'none',
    WebkitAppearance: 'none',
    transition: 'background var(--dur-fast) var(--ease)',
    ...style,
  };
  if (onClick) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={baseStyle}
        {...dataAttrs}
      >
        {children}
      </button>
    );
  }
  return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel}
      style={baseStyle}
      {...dataAttrs}
    >
      {children}
    </span>
  );
});
