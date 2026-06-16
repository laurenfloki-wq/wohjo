// FLOSTRUCTION /command — EmptyState.
// Empty states are achievements, not voids. The copy must answer
// "what does the absence of this mean?" in a calm voice.

import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--s-7) var(--s-5)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        color: 'var(--ink-secondary)',
      }}
    >
      {icon ? (
        <div style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-muted)' }}>{icon}</div>
      ) : null}
      <h3
        style={{
          // EmptyState is a section heading, not a page title — Inter sans
          // semibold (the global h3 rule), kept inline so the type intent
          // is explicit on the component.
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--t-md)',
          fontWeight: 600,
          color: 'var(--ink)',
          letterSpacing: '-0.005em',
          marginBottom: 8,
        }}
      >
        {title}
      </h3>
      {description ? (
        <p style={{ maxWidth: 480, margin: '0 auto var(--s-4)', color: 'var(--ink-secondary)' }}>
          {description}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 'var(--s-4)' }}>{action}</div> : null}
    </div>
  );
}
