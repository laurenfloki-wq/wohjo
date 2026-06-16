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

describe('ApprovalsClient — export buttons (CRACK 216 + WLES v1 two-provider)', () => {
  it('1. MYOB shortcut button keeps data-testid="generate-export-btn"', () => {
    expect(SOURCE).toContain('data-testid="generate-export-btn"');
  });

  it('2. buttons call handleExport with an explicit provider', () => {
    expect(SOURCE).toContain("onClick={() => handleExport('myob')}");
    expect(SOURCE).toContain("onClick={() => handleExport('employment_hero')}");
  });

  it('3. export buttons disable while any export is in flight (exportLoading !== null)', () => {
    expect(SOURCE).toContain('disabled={exportLoading !== null}');
    expect(SOURCE).toContain(
      "const [exportLoading, setExportLoading] = useState<null | 'myob' | 'employment_hero'>(null)",
    );
  });

  it('4. MYOB export POSTs to /api/exports/myob; Employment Hero POSTs to /api/command/export', () => {
    expect(SOURCE).toMatch(/fetch\(['"]\/api\/exports\/myob['"]/);
    expect(SOURCE).toMatch(/fetch\(['"]\/api\/command\/export['"]/);
    expect(SOURCE).toContain("method: 'POST'");
  });

  it('5. exports derive from PAYROLL_APPROVED shifts (MYOB by shift_ids, EH by pay period)', () => {
    expect(SOURCE).toContain("status === 'PAYROLL_APPROVED'");
    expect(SOURCE).toContain('shift_ids: payrollApproved.map((s) => s.id)');
    expect(SOURCE).toContain("provider_id: 'employment_hero'");
  });

  it('6. download is funnelled through a blob helper (createObjectURL/revoke/download)', () => {
    expect(SOURCE).toContain('URL.createObjectURL(blob)');
    expect(SOURCE).toContain('URL.revokeObjectURL(url)');
    expect(SOURCE).toContain('a.download = filename');
  });

  it('7. both providers are surfaced in the export toolbar', () => {
    expect(SOURCE).toContain('data-testid="export-myob-btn"');
    expect(SOURCE).toContain('data-testid="export-eh-btn"');
    expect(SOURCE).toContain('data-testid="export-toolbar"');
  });

  it('8. loading state shows "Generating…" text on the MYOB shortcut button', () => {
    expect(SOURCE).toContain("exportLoading === 'myob' ? 'Generating…' : 'Generate MYOB Export'");
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
    expect(SOURCE).toContain(
      "showToast(json.error ?? `MYOB export failed (${res.status})`, 'error')",
    );
    expect(SOURCE).not.toContain('setExportError(');
    expect(SOURCE).not.toContain('{exportError && (');
  });

  it('success path calls showToast with default success type', () => {
    expect(SOURCE).toContain('showToast(`MYOB export complete');
    // No explicit 'error' type on the success call
    expect(SOURCE).toMatch(/showToast\(`MYOB export complete[^`]*`\)/);
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
