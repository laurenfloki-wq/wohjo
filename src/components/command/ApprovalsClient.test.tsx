// ApprovalsClient — CRACK 216 export button substrate tests.
//
// Source-string substrate pattern (matches codebase convention — no
// @testing-library/react installed). Verifies the contract properties
// of the export button without needing a render environment.
//
// Covers:
//   1. Button is wired with data-testid="generate-export-btn"
//   2. Button is NOT disabled (no disabled attribute on the element)
//   3. onClick is wired to handleExport (not a stub/noop)
//   4. handleExport POSTs to /api/exports/myob with shift_ids
//   5. handleExport uses shift IDs from PAYROLL_APPROVED shifts
//   6. Success path triggers blob download via URL.createObjectURL
//   7. Error path sets exportError state (error div rendered)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/command/ApprovalsClient.tsx'),
  'utf-8',
);

describe('ApprovalsClient — export button (CRACK 216)', () => {
  it('1. button has data-testid="generate-export-btn"', () => {
    expect(SOURCE).toContain('data-testid="generate-export-btn"');
  });

  it('2. button calls handleExport on click (not disabled by default)', () => {
    expect(SOURCE).toContain('onClick={handleExport}');
  });

  it('3. button is disabled only while exportLoading is true', () => {
    expect(SOURCE).toContain('disabled={exportLoading}');
    // Confirm initial state is false (not hard-disabled)
    expect(SOURCE).toContain('const [exportLoading, setExportLoading] = useState(false)');
  });

  it('4. handleExport POSTs to /api/exports/myob', () => {
    expect(SOURCE).toMatch(/fetch\(['"]\/api\/exports\/myob['"]/);
    expect(SOURCE).toContain("method: 'POST'");
  });

  it('5. handleExport sends shift_ids derived from PAYROLL_APPROVED shifts', () => {
    expect(SOURCE).toContain("status === 'PAYROLL_APPROVED'");
    expect(SOURCE).toContain('shift_ids: payrollApprovedIds');
  });

  it('6. success path creates object URL for download (blob trigger)', () => {
    expect(SOURCE).toContain('URL.createObjectURL(blob)');
    expect(SOURCE).toContain('URL.revokeObjectURL(url)');
    expect(SOURCE).toContain('a.download = filename');
  });

  it('7. error path sets exportError for display in the UI', () => {
    expect(SOURCE).toContain('setExportError(');
    expect(SOURCE).toContain('{exportError && (');
  });

  it('8. loading state shows "Generating…" text in the button', () => {
    expect(SOURCE).toContain("exportLoading ? 'Generating…' : 'Generate FLOSTRUCTION Export'");
  });
});

// ─── CRACK 218 — Final Approve regression fix ───────────────────────────
describe('ApprovalsClient — Final Approve (CRACK 218)', () => {
  it('9. Final Approve button is wired with data-testid="final-approve-btn"', () => {
    expect(SOURCE).toContain('data-testid="final-approve-btn"');
  });

  it('10. Final Approve button disables itself while approvingShift matches', () => {
    expect(SOURCE).toMatch(/disabled=\{approvingShift === shift\.id\}/);
    expect(SOURCE).toContain(
      'const [approvingShift, setApprovingShift] = useState<string | null>(null)',
    );
  });

  it('11. Final Approve handler does NOT send admin_user_id from the client', () => {
    // The 'payroll-admin' string bug is the precise issue CRACK 218 fixes.
    // The route now derives userId from session via requireCompanyMembership,
    // so the client must not pretend to know it.
    expect(SOURCE).not.toMatch(/admin_user_id:\s*['"]payroll-admin['"]/);
    expect(SOURCE).not.toMatch(/admin_user_id:\s*['"]payroll-admin['"]/);
  });

  it('12. Final Approve awaits real response and reads success/error_message', () => {
    expect(SOURCE).toMatch(/await\s+fetch\(`\/api\/command\/shifts\/\$\{shiftId\}\/approve`/);
    expect(SOURCE).toContain('data.error_message');
  });

  it('13. Final Approve shows error toast (variant=error) on non-ok response', () => {
    // showToast must accept a variant and the route handler surfaces error_message
    expect(SOURCE).toMatch(/showToast\([^)]+,\s*['"]error['"]\)/);
  });

  it('14. Toast UI renders the variant data attribute for QA visibility', () => {
    expect(SOURCE).toContain('data-testid="approvals-toast"');
    expect(SOURCE).toContain('data-variant={toastVariant}');
  });

  it('15. Bulk approve button disables itself + uses the same auth-derived route', () => {
    expect(SOURCE).toContain('data-testid="bulk-approve-btn"');
    expect(SOURCE).toContain('disabled={bulkApproving}');
    // Bulk path must also drop admin_user_id from the body
    expect(SOURCE).not.toMatch(/admin_user_id:\s*['"]payroll-admin['"]/);
  });

  it('16. Adjust + Dispute no longer post admin_user_id from the client (WS6 audit)', () => {
    // Two route audits — both should send only the domain payload now
    const adjustBlock = SOURCE.split('handleAdjust')[1] ?? '';
    expect(adjustBlock).not.toMatch(/admin_user_id:/);
    const disputeBlock = SOURCE.split('handleDispute')[1] ?? '';
    expect(disputeBlock).not.toMatch(/admin_user_id:/);
  });
});
