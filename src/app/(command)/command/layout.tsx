import type { ReactNode } from 'react';
import CommandNav from '@/components/command/CommandNav';
import { TrustBar } from '@/components/command/ui/TrustBar';

/**
 * /command surface layout — Apple-award redesign.
 *
 * Light-by-default. The previous `command-dark` charcoal scope is
 * replaced with `command-light`, defined in src/styles/command-tokens.css.
 * That token file is the single source of truth for colour, spacing,
 * type, and motion across the surface. A `[data-theme="dark"]` variant
 * is available behind the same scope class but no UI toggle is wired
 * yet (the dispatch requested the dark mapping but not the chrome).
 */
export default function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="command-light"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      <TrustBar />
      <CommandNav />
      <main id="main" style={{ flex: 1 }}>
        <div
          style={{
            maxWidth: 'var(--page-max)',
            margin: '0 auto',
            padding: 'var(--s-6) var(--page-gutter) var(--s-7)',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      </main>
      <footer
        style={{
          padding: 'var(--s-5) var(--page-gutter)',
          textAlign: 'center',
          fontSize: 'var(--t-xs)',
          color: 'var(--ink-muted)',
          lineHeight: 1.55,
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        FLOSTRUCTION verifies hours and records shift events. Downstream
        calculations are performed by your existing payroll provider.
      </footer>
    </div>
  );
}
