// Phase 1 dispute-correction workflow — schema + UI substrate guard.
//
// Source-string assertions on:
//   - migrations/202605011000_dispute_correction_phase1.sql — three new
//     event types + parent_shift_event_id + correction_reason columns
//     + correction_consistency_check; Drizzle schema mirror in src/db/schema.ts
//   - src/db/schema.ts — same three event types in the Drizzle CHECK
//     literal + parent_shift_event_id + correction_reason fields
//   - src/components/command/ApprovalsClient.tsx — Issue Correction CTA
//     wired to CorrectionModal
//   - src/components/command/CorrectionModal.tsx — modal presents the
//     three correction types and posts to the correct endpoint
//
// Pattern matches WlesLayout.canonical.test.ts and the visual-regression
// test battery — source-string assertions, no React renderer required.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
}

const MIGRATION = read('migrations/202605011000_dispute_correction_phase1.sql');
const SCHEMA = read('src/db/schema.ts');
const APPROVALS_CLIENT = read('src/components/command/ApprovalsClient.tsx');
const CORRECTION_MODAL = read('src/components/command/CorrectionModal.tsx');
const ROUTE = read('src/app/api/command/shifts/[shiftId]/correct/route.ts');

describe('Phase 1 migration — dispute-correction substrate', () => {
  it('adds the three new event types to the CHECK constraint', () => {
    expect(MIGRATION).toMatch(/'CORRECTION'/);
    expect(MIGRATION).toMatch(/'BUG_CORRECTION'/);
    expect(MIGRATION).toMatch(/'SUPERVISOR_RE_APPROVAL'/);
  });

  it('preserves the eight pre-Phase-1 event types in the new CHECK', () => {
    for (const t of [
      'START_EVENT', 'END_EVENT', 'SHIFT_COMMIT', 'SUPERVISOR_APPROVAL',
      'INTELLIGENCE_CLEAR', 'ANOMALY_FLAG', 'DISPUTE_RAISED', 'EXPORT_RECORD',
    ]) {
      expect(MIGRATION).toContain(`'${t}'`);
    }
  });

  it('adds parent_shift_event_id with FK to shift_events.id', () => {
    expect(MIGRATION).toMatch(/parent_shift_event_id UUID NULL/);
    expect(MIGRATION).toMatch(/REFERENCES public\.shift_events\(id\)/);
  });

  it('adds correction_reason TEXT column', () => {
    expect(MIGRATION).toMatch(/correction_reason TEXT NULL/);
  });

  it('enforces correction-consistency at the DB layer', () => {
    expect(MIGRATION).toMatch(/shift_events_correction_consistency_check/);
    expect(MIGRATION).toMatch(/parent_shift_event_id IS NOT NULL/);
    expect(MIGRATION).toMatch(/parent_shift_event_id IS NULL/);
  });

  it('indexes parent_shift_event_id for audit-trail queries', () => {
    expect(MIGRATION).toMatch(/idx_shift_events_parent/);
  });
});

describe('Drizzle schema mirror — correction substrate fields', () => {
  it('CHECK literal includes the three new event types', () => {
    expect(SCHEMA).toMatch(/'CORRECTION'/);
    expect(SCHEMA).toMatch(/'BUG_CORRECTION'/);
    expect(SCHEMA).toMatch(/'SUPERVISOR_RE_APPROVAL'/);
  });

  it('parent_shift_event_id field declared in shift_events table', () => {
    expect(SCHEMA).toMatch(/parent_shift_event_id:\s*uuid\('parent_shift_event_id'\)/);
  });

  it('correction_reason field declared in shift_events table', () => {
    expect(SCHEMA).toMatch(/correction_reason:\s*text\('correction_reason'\)/);
  });
});

describe('ApprovalsClient — Issue Correction CTA wiring', () => {
  it('imports CorrectionModal', () => {
    expect(APPROVALS_CLIENT).toMatch(/import\s+CorrectionModal\s+from\s+'\.\/CorrectionModal'/);
  });

  it('renders the Issue correction CTA via data-testid', () => {
    expect(APPROVALS_CLIENT).toMatch(/data-testid="issue-correction-cta"/);
    expect(APPROVALS_CLIENT).toMatch(/Issue correction/);
  });

  it('renders CorrectionModal at the component root when target is set', () => {
    expect(APPROVALS_CLIENT).toMatch(/<CorrectionModal/);
    expect(APPROVALS_CLIENT).toMatch(/parentShiftEventId=\{correctionTarget\.parentShiftEventId\}/);
  });

  it('refreshes shift data on successful correction', () => {
    expect(APPROVALS_CLIENT).toMatch(/onSuccess=\{/);
    expect(APPROVALS_CLIENT).toMatch(/fetchData\(\)/);
  });
});

describe('CorrectionModal — Phase 1 UX surface', () => {
  it('exposes the three correction types in a select', () => {
    expect(CORRECTION_MODAL).toMatch(/CorrectionType\s*=\s*'CORRECTION'\s*\|\s*'BUG_CORRECTION'\s*\|\s*'SUPERVISOR_RE_APPROVAL'/);
  });

  it('POSTs to /api/command/shifts/[id]/correct', () => {
    expect(CORRECTION_MODAL).toMatch(/\/api\/command\/shifts\/\$\{shiftId\}\/correct/);
  });

  it('sends correction_type, parent_shift_event_id, and correction_reason', () => {
    expect(CORRECTION_MODAL).toMatch(/correction_type/);
    expect(CORRECTION_MODAL).toMatch(/parent_shift_event_id/);
    expect(CORRECTION_MODAL).toMatch(/correction_reason/);
  });

  it('uses the design-system Dialog + Select primitives (CADA redesign)', () => {
    // CADA replaces the bespoke charcoal-amber-cream modal with the
    // shared Dialog + Select primitives. Same intent (visual contract
    // pinned to canonical tokens) — different language: the primitives
    // resolve through the --surface/--ink/--accent semantic tokens
    // defined in src/styles/command-tokens.css, so a future palette
    // refresh updates this modal alongside every other surface.
    expect(CORRECTION_MODAL).toMatch(/from '\.\/ui'/);
    expect(CORRECTION_MODAL).toMatch(/<Dialog\b/);
    expect(CORRECTION_MODAL).toMatch(/<Select\b/);
    // Never rebind to the old per-page palette literals.
    expect(CORRECTION_MODAL).not.toMatch(/Archivo Narrow/);
    expect(CORRECTION_MODAL).not.toMatch(/--color-amber/);
  });

  it('explains chain-extension semantics in the heading copy', () => {
    expect(CORRECTION_MODAL).toMatch(/Extend the chain with a corrective record/);
    expect(CORRECTION_MODAL).toMatch(/original event stays sealed/);
  });
});

describe('Correction route — invariants surface in source', () => {
  it('declares the zod schema enum to match Phase 1 types', () => {
    expect(ROUTE).toMatch(/z\.enum\(\['CORRECTION',\s*'BUG_CORRECTION',\s*'SUPERVISOR_RE_APPROVAL'\]\)/);
  });

  it('uses generateEventHash for chain extension', () => {
    expect(ROUTE).toMatch(/generateEventHash/);
  });

  it('inserts parent_shift_event_id and correction_reason columns', () => {
    expect(ROUTE).toMatch(/parent_shift_event_id:/);
    expect(ROUTE).toMatch(/correction_reason:/);
  });

  it('does NOT update the shifts aggregate row (Phase 2 work)', () => {
    // Pin: the route must NOT call .from('shifts').update(...) anywhere.
    // The aggregate-row update is deferred to Phase 2 where UX decisions
    // about "current state" semantics for corrections firm up.
    expect(ROUTE).not.toMatch(/from\('shifts'\)\s*\n?\s*\.update/);
  });

  it('enforces tenant isolation on the parent event lookup', () => {
    expect(ROUTE).toMatch(/parentEvent\.company_id !== shift\.company_id/);
  });
});
