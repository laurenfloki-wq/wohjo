import type { ReactNode } from 'react';
import Masthead from '@/components/command/Masthead';

/**
 * /command surface layout.
 *
 * One unified Masthead handles wordmark + nav + bonded readout. The
 * `.flos-content` class on both the masthead inner and the page inner
 * guarantees a single shared left edge so the wordmark, nav, and
 * content all line up — no orphan flush-left lockup against a centred
 * content column. Token source of truth: src/styles/command-tokens.css.
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
      <Masthead />
      <main id="main" style={{ flex: 1 }}>
        <div
          className="flos-content"
          style={{ padding: 'var(--s-6) var(--page-gutter) var(--s-7)' }}
        >
          {children}
        </div>
      </main>
      <footer
        style={{
          textAlign: 'center',
          padding: 'var(--s-5) var(--page-gutter)',
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
