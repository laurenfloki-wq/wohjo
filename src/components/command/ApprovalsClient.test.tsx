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
