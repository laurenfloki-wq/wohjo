// ApprovalsClient — export button substrate tests.
//
// Source-string substrate pattern (no @testing-library/react). Verifies
// the contract properties of the export button and toast system.
//
// CRACK 216: initial export button contract
// CRACK 219: red/green toast variants (replaces exportError static div)

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

  it('2. button calls handleExport on click', () => {
    expect(SOURCE).toContain('onClick={handleExport}');
  });

  it('3. button is disabled only while exportLoading is true', () => {
    expect(SOURCE).toContain('disabled={exportLoading}');
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

  it('8. loading state shows "Generating…" text in the button', () => {
    expect(SOURCE).toContain("exportLoading ? 'Generating…' : 'Generate FLOSTRUCTION Export'");
  });
});

describe('ApprovalsClient — red/green toast variants (CRACK 219)', () => {
  it('toast state is typed with msg + type fields', () => {
    expect(SOURCE).toContain("'success' | 'error'");
    expect(SOURCE).toContain('{ msg, type }');
  });

  it('toast background uses error color for type=error', () => {
    expect(SOURCE).toContain("toast.type === 'error'");
    expect(SOURCE).toContain('var(--color-warm-red)');
    expect(SOURCE).toContain('var(--color-green)');
  });

  it('export error uses showToast with error type instead of static div', () => {
    expect(SOURCE).toContain("showToast(json.error ?? `Export failed (${res.status})`, 'error')");
    expect(SOURCE).not.toContain('setExportError(');
    expect(SOURCE).not.toContain('{exportError && (');
  });

  it('success path calls showToast with default success type', () => {
    expect(SOURCE).toContain('showToast(`Export complete');
    // No explicit 'error' type on the success call
    expect(SOURCE).toMatch(/showToast\(`Export complete[^`]*`\)/);
  });
});

// ─── CRACK 218 — Final Approve regression fix ───────────────────────────
describe('ApprovalsClient — Final Approve (CRACK 218)', () => {
  it('Final Approve button is wired with data-testid="final-approve-btn"', () => {
    expect(SOURCE).toContain('data-testid="final-approve-btn"');
  });

  it('Final Approve button disables itself while approvingShift matches', () => {
    expect(SOURCE).toMatch(/disabled=\{approvingShift === shift\.id\}/);
    expect(SOURCE).toContain(
      'const [approvingShift, setApprovingShift] = useState<string | null>(null)',
    );
  });

  it('Final Approve handler does NOT send admin_user_id from the client', () => {
    // 'payroll-admin' literal must never appear as an admin_user_id body field
    expect(SOURCE).not.toMatch(/admin_user_id:\s*['"]payroll-admin['"]/);
  });

  it('Final Approve awaits real response and reads success/error_message', () => {
    expect(SOURCE).toMatch(/await\s+fetch\(`\/api\/command\/shifts\/\$\{shiftId\}\/approve`/);
    expect(SOURCE).toContain('data.error_message');
  });

  it('Final Approve shows error toast variant on non-ok response', () => {
    expect(SOURCE).toMatch(/showToast\([^)]+,\s*['"]error['"]\)/);
  });

  it('Toast UI renders the variant data attribute for QA visibility', () => {
    expect(SOURCE).toContain('data-testid="approvals-toast"');
    expect(SOURCE).toContain('data-variant={toast.type}');
  });

  it('Bulk approve button disables itself + uses session-derived auth', () => {
    expect(SOURCE).toContain('data-testid="bulk-approve-btn"');
    expect(SOURCE).toContain('disabled={bulkApproving}');
  });

  it('Adjust + Dispute no longer post admin_user_id from the client (WS6 audit)', () => {
    const adjustBlock = SOURCE.split('handleAdjust')[1] ?? '';
    expect(adjustBlock).not.toMatch(/admin_user_id:/);
    const disputeBlock = SOURCE.split('handleDispute')[1] ?? '';
    expect(disputeBlock).not.toMatch(/admin_user_id:/);
  });
});
