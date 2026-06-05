// FLOSTRUCTION /command — StatusChip.
// Semantic colour ONLY: verified | review | flagged | info | neutral.
// Decorative colour is forbidden by the design doctrine — the chip's
// visual weight is intentionally low; the label carries the meaning.
//
// Shape (height, padding, font, radius, alignment) is shared with
// SealChip via the SHARED_CHIP_BASE export so the two sit as a matched
// pair on one baseline; only colour + icon vary by semantic.

import type { CSSProperties, ReactNode } from 'react';

export type ChipKind = 'verified' | 'review' | 'flagged' | 'info' | 'neutral';

interface Props {
  kind: ChipKind;
  children: ReactNode;
  icon?: ReactNode;
  /** Use a more compact chip for inside-row contexts. */
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

const KIND_VARS: Record<ChipKind, { fg: string; bg: string; border: string }> = {
  verified: { fg: 'var(--verified)', bg: 'var(--verified-bg)', border: 'var(--verified-border)' },
  review:   { fg: 'var(--review)',   bg: 'var(--review-bg)',   border: 'var(--review-border)' },
  flagged:  { fg: 'var(--flagged)',  bg: 'var(--flagged-bg)',  border: 'var(--flagged-border)' },
  info:     { fg: 'var(--info)',     bg: 'var(--info-bg)',     border: 'transparent' },
  neutral:  { fg: 'var(--ink-secondary)', bg: 'var(--surface-2)', border: 'var(--rule)' },
};

/**
 * Shared chip base — exported so SealChip + StatusChip have identical
 * dimensions and sit on the same baseline. Size variants here are the
 * single source of truth for chip geometry on the surface.
 */
export const SHARED_CHIP_BASE = {
  sm: {
    height: 22,
    padding: '0 10px',
    fontSize: 11,
    radius: 'var(--r-pill)' as const,
  },
  md: {
    height: 26,
    padding: '0 12px',
    fontSize: 12,
    radius: 'var(--r-pill)' as const,
  },
} as const;

export function StatusChip({ kind, children, icon, size = 'md', style }: Props) {
  const c = KIND_VARS[kind];
  const geom = SHARED_CHIP_BASE[size];
  return (
    <span
      data-kind={kind}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: geom.height,
        padding: geom.padding,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: geom.radius,
        fontSize: geom.fontSize,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        boxSizing: 'border-box',
        fontVariantNumeric: 'tabular-nums lining-nums',
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
