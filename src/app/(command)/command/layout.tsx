import type { ReactNode } from 'react';

export default function CommandLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-secondary)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1 }}>
        {children}
      </div>
      <footer style={{
        padding: '20px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--color-text-tertiary)',
        lineHeight: 1.5,
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}>
        Flostruction verifies hours and records shift events. Downstream
        calculations are performed by your existing payroll provider.
      </footer>
    </div>
  );
}
