// FLOSTRUCTION /command — PageHeader.
// One canonical page header for every /command page. The eyebrow above
// the title is OPTIONAL and used sparingly — never the literal label
// "COMMAND". Page titles set with --t-2xl + tight tracking.

import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  trailing?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, trailing }: Props) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 'var(--s-5)',
        margin: '0 0 var(--s-6) 0',
        paddingBottom: 'var(--s-5)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow ? (
          <div
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-muted)',
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--t-2xl)',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            color: 'var(--ink)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              marginTop: 12,
              color: 'var(--ink-secondary)',
              fontSize: 'var(--t-md)',
              maxWidth: 640,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
    </header>
  );
}
