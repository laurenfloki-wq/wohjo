// /command/approvals — the work surface.
// Page chrome only; all data + interaction in ApprovalsClient.

import ApprovalsClient from '@/components/command/ApprovalsClient';
import { PageHeader } from '@/components/command/ui';

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review, approve, and export timesheets. Each shift is sealed at capture; you’re deciding which ones to send to your payroll provider."
      />
      <ApprovalsClient />
    </>
  );
}
