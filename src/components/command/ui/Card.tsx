// FLOSTRUCTION /command — Card.
// Hairline border on raised surface. No shadow (overlay-only per tokens).

import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Use the sunken surface treatment (Overview "needs your attention" etc.) */
  sunken?: boolean;
  /** Tightens padding for dense lists. */
  dense?: boolean;
  /** Render without padding (rare — e.g. a DataTable embedded edge-to-edge). */
  flush?: boolean;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'article' | 'aside';
}

export function Card({ children, sunken, dense, flush, style, as: As = 'section' }: Props) {
  const padding = flush ? 0 : dense ? 'var(--s-4)' : 'var(--card-padding)';
  return (
    <As
      style={{
        background: sunken ? 'var(--surface-sunken)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding,
        ...style,
      }}
    >
      {children}
    </As>
  );
}

interface SectionProps {
  title?: ReactNode;
  trailing?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/** Standardised section header inside a Card. */
export function CardHeader({ title, trailing, description }: Omit<SectionProps, 'children'>) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        marginBottom: description ? 'var(--s-2)' : 'var(--s-4)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {title ? (
          <h3 style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--ink)' }}>{title}</h3>
        ) : null}
        {description ? (
          <p style={{ marginTop: 4, color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
            {description}
          </p>
        ) : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </header>
  );
}
