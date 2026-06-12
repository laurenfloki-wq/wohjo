// W3 / SG-4 — substrate-anchor tamper-evidence pins (2026-06-11).
//
// The M3 migration created the anchor substrate (substrate_anchors +
// v_anchor_verification + the anchor_fingerprint check_name); this
// suite pins the WIRING that makes it evidence rather than schema:
// the daily runner, the dual-mode chain recording, and the migration's
// two-place forcing function.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');
const RUNNER = read('src/app/api/cron/substrate-health/route.ts');
const VERIFY = read('src/app/api/cron/verify-hashes/route.ts');
const MIGRATION = read(
  'migrations/20260605235545_m3_substrate_anchors_table_view_and_health_check.sql',
);

describe('W3.1 — the anchor check runs and records', () => {
  it('runner reads v_anchor_verification and writes anchor_fingerprint rows', () => {
    expect(RUNNER).toMatch(/from\(['"]v_anchor_verification['"]\)/);
    expect(RUNNER).toMatch(/check_name:\s*['"]anchor_fingerprint['"]/);
  });

  it('status mapping covers GREEN, RED, and the unverifiable ERROR case', () => {
    expect(RUNNER).toMatch(/['"]GREEN['"]/);
    expect(RUNNER).toMatch(/['"]RED['"]/);
    expect(RUNNER).toMatch(/['"]ERROR['"]/);
    expect(RUNNER).toMatch(/matches === false/);
    expect(RUNNER).toMatch(/matches === null/);
  });

  it('RED/ERROR write durable alert rows BEFORE the health record', () => {
    expect(RUNNER).toMatch(/ANCHOR_MISMATCH:/);
    expect(RUNNER).toMatch(/ANCHOR_UNVERIFIABLE:/);
    const alertIdx = RUNNER.indexOf("from('admin_access_log')");
    const healthIdx = RUNNER.indexOf("from('substrate_health_log')");
    expect(alertIdx).toBeGreaterThan(-1);
    expect(healthIdx).toBeGreaterThan(alertIdx);
  });

  it('runner is CRON_SECRET-gated and uses the loud system accessor', () => {
    expect(RUNNER).toMatch(/Bearer \$\{process\.env\.CRON_SECRET\}/);
    expect(RUNNER).toMatch(/getServiceClientForSystemJob\(\)/);
  });

  it('runner never mutates the anchors or the chain (detection only)', () => {
    expect(RUNNER).not.toMatch(/from\(['"]substrate_anchors['"]\)/);
    expect(RUNNER).not.toMatch(/from\(['"]shift_events['"]\)/);
  });

  it('the cron is scheduled', () => {
    const vercel = read('vercel.json');
    expect(vercel).toMatch(/\/api\/cron\/substrate-health/);
  });
});

describe('W3.2 — dual-mode chain outcome lands in the evidentiary log', () => {
  it('verify-hashes records chain_integrity_shift_events GREEN/RED', () => {
    expect(VERIFY).toMatch(/check_name:\s*['"]chain_integrity_shift_events['"]/);
    expect(VERIFY).toMatch(/from\(['"]substrate_health_log['"]\)/);
  });

  it('the health write is best-effort: alert rows + email remain primary', () => {
    const alertIdx = VERIFY.indexOf('writeAlertRows(');
    const healthIdx = VERIFY.indexOf("from('substrate_health_log')");
    // Health write sits in its own try/catch and does not gate alerts.
    expect(VERIFY).toMatch(/health log write failed/);
    expect(alertIdx).toBeGreaterThan(-1);
    expect(healthIdx).toBeGreaterThan(-1);
  });

  it('dual-mode verification is intact (spec-aware: v1 §8 + v0 seal-time methods)', () => {
    // SG-4 / Dispatch 2 (2026-06-12): dual-mode verification moved into
    // the spec-aware verifier. The route delegates to it; the module
    // carries WLES v1.0 §8 (verifyV1Event) AND the v0 seal-time
    // recomputation paths (generateEventHash et al). Pin both layers.
    expect(VERIFY).toMatch(/verifyCompanyChainSpecAware/);
    const SPEC_AWARE = read('src/lib/wles/chain-verify-spec-aware.ts');
    expect(SPEC_AWARE).toMatch(/verifyV1Event/);
    expect(SPEC_AWARE).toMatch(/generateEventHash/);
    expect(SPEC_AWARE).toMatch(/ZERO_HASH/);
  });
});

describe('W3.3 — the migration forcing function holds', () => {
  it('every anchor inserted by the migration has an inline formula CASE in the view', () => {
    const inserted = [...MIGRATION.matchAll(/VALUES\s*\(\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(inserted.length).toBeGreaterThan(0);
    for (const id of inserted) {
      const cases = [...MIGRATION.matchAll(new RegExp(`WHEN '${id}' THEN`, 'g'))];
      // fingerprint, count, and matches branches — three CASE arms.
      expect(cases.length, `anchor ${id} needs all three CASE arms`).toBeGreaterThanOrEqual(3);
    }
  });

  it('formula_text is documentation only (never executed) — comment pinned', () => {
    expect(MIGRATION).toMatch(/DOCUMENTATION ONLY/i);
    expect(MIGRATION).toMatch(/never executed/i);
  });
});
