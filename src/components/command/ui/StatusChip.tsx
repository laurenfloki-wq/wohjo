// FLOSTRUCTION /command — StatusChip.
// Semantic colour ONLY: verified | review | flagged | info | neutral.
// Decorative colour is forbidden by the design doctrine — the chip's
// visual weight is intentionally low; the label carries the meaning.

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
  neutral:  { fg: 'var(--ink-secondary)', bg: 'var(--surface-sunken)', border: 'var(--border)' },
};

export function StatusChip({ kind, children, icon, size = 'md', style }: Props) {
  const c = KIND_VARS[kind];
  return (
    <span
      data-kind={kind}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 'var(--r-pill)',
        fontSize: size === 'sm' ? 11 : 'var(--t-xs)',
        fontWeight: 500,
        lineHeight: 1.2,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
