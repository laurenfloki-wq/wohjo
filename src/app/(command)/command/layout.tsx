import type { ReactNode } from 'react';

/**
 * /command surface layout — repainted to canonical mockup language
 * 2026-04-30 evening per supporting-screens.html.
 *
 * The `command-dark` class is scoped in src/app/globals.css and
 * re-binds the existing --color-bg / --color-text-primary / etc.
 * variables to charcoal-dominant values within /command only.
 * Other surfaces (/, /field, /command-adjacent admin
 * routes) are unaffected.
 */
export default function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="command-dark"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ flex: 1 }}>{children}</div>
      <footer
        style={{
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          lineHeight: 1.55,
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.02em',
        }}
      >
        Flostruction verifies hours and records shift events. Downstream
        calculations are performed by your existing payroll provider.
      </footer>
    </div>
  );
}
