import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// C1 (audit) — the SMS approval path must seal the REAL approved hours, never a
// false zero (work-order item #7).
//
// The bug: `companies.total_hours` is a numeric column, which Supabase returns
// as a STRING. The old SMS-reply handler tested `typeof total_hours === 'number'`
// — always false — and sealed approved_hours = 0 into the APPEND-ONLY WLES wage
// ledger for every SMS approval. An understated wage record that cannot be
// edited, only quarantined: exactly the failure this product exists to prevent.
//
// The fix (route line ~699): approvedHours: parseFloat(shift.total_hours ?? '0').
// No prod SMS approval has exercised it yet (a live staged "YES" remains an
// owner-run check, Tier 2), so this regression pin is the standing guard: the
// seal must read the parsed total_hours and must NOT bind a literal zero.
//
// (A genuine 0 — unpaid standby — is still allowed by buildApproval downstream;
// this only forbids the FALSE zero from a stringified number.)

const ROOT = join(__dirname, '..', '..');
const SRC = readFileSync(
  join(ROOT, 'src/app/api/webhooks/twilio/sms-reply/route.ts'),
  'utf8',
);

describe('C1 — SMS approval seals real approved hours, not a false zero', () => {
  it('seals approvedHours by parsing total_hours (the C1 fix)', () => {
    expect(SRC).toMatch(/approvedHours:\s*parseFloat\(\s*shift\.total_hours\s*\?\?\s*'0'\s*\)/);
  });

  it('never seals a literal zero into the approval (the C1 bug)', () => {
    expect(SRC).not.toMatch(/approvedHours:\s*0\b/);
  });

  it('does not resurrect the broken typeof-number guard on total_hours', () => {
    expect(SRC).not.toMatch(/typeof\s+\w*total_hours\w*\s*===?\s*'number'/);
  });

  it('every approvedHours seal in this route is the parsed form', () => {
    const seals = SRC.match(/approvedHours:\s*[^,\n]+/g) ?? [];
    expect(seals.length).toBeGreaterThan(0);
    for (const s of seals) {
      expect(s).toContain('parseFloat');
      expect(s).toContain('total_hours');
    }
  });
});
