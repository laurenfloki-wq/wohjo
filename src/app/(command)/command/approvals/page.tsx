// Flostruction Command — Approvals Dashboard
// /command/approvals
// Shows all shifts in current pay period with approval workflow.

import CommandNav from '@/components/command/CommandNav';
import ApprovalsClient from '@/components/command/ApprovalsClient';

export default function ApprovalsPage() {
  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
            Approvals
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Review, approve, and export timesheets
          </p>
        </div>
        <ApprovalsClient />
      </div>
    </>
  );
}
