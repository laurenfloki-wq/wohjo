// Flostruction Command — Approvals Dashboard
// /command/approvals
// Shows all shifts in current pay period with approval workflow.

import CommandNav from '@/components/command/CommandNav';
import ApprovalsClient from '@/components/command/ApprovalsClient';

export default function ApprovalsPage() {
  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 8,
          }}>Command</div>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
            color: 'var(--color-text-primary)', margin: 0,
            letterSpacing: '-0.012em', lineHeight: 1.05,
          }}>
            Approvals
          </h1>
          <p style={{
            fontSize: 14, color: 'var(--color-text-tertiary)', marginTop: 8,
            fontFamily: 'var(--font-sans)',
          }}>
            Review, approve, and export timesheets.
          </p>
        </div>
        <ApprovalsClient />
      </div>
    </>
  );
}
