// FLOSTRUCTION /command — StatusChip.
// Thin semantic wrapper over the Chip primitive. Geometry is locked
// in Chip; this file only maps semantic kinds to colour tokens.

import type { ReactNode } from 'react';
import { Chip, type ChipSize } from './Chip';

export type ChipKind = 'verified' | 'review' | 'flagged' | 'info' | 'neutral';

interface Props {
  kind: ChipKind;
  children: ReactNode;
  icon?: ReactNode;
  size?: ChipSize;
}

const KIND_VARS: Record<ChipKind, { fg: string; bg: string; border: string }> = {
  verified: { fg: 'var(--verified)', bg: 'var(--verified-bg)', border: 'var(--verified-border)' },
  review: { fg: 'var(--review)', bg: 'var(--review-bg)', border: 'var(--review-border)' },
  flagged: { fg: 'var(--flagged)', bg: 'var(--flagged-bg)', border: 'var(--flagged-border)' },
  info: { fg: 'var(--info)', bg: 'var(--info-bg)', border: 'transparent' },
  neutral: { fg: 'var(--ink-secondary)', bg: 'var(--surface-2)', border: 'var(--rule)' },
};

export function StatusChip({ kind, children, icon, size = 'md' }: Props) {
  const c = KIND_VARS[kind];
  return (
    <Chip bg={c.bg} fg={c.fg} border={c.border} size={size} dataAttrs={{ 'data-kind': kind }}>
      {icon}
      {children}
    </Chip>
  );
}
