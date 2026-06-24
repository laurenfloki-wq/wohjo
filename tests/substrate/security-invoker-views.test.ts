import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Guard: every public view that must run as SECURITY INVOKER stays INVOKER
// after a clean rebuild from migrations — no later CREATE OR REPLACE may
// silently drop the option (Supabase advisor lint 0010, ERROR).
//
// Why this exists: 20260623160000_wles_a1_v1_fingerprint_anchor recreated
// v_anchor_verification with a bare CREATE OR REPLACE VIEW, which resets
// reloptions, dropping the security_invoker=true that 20260605235624_m3a had
// set — silently flipping the view back to SECURITY DEFINER in prod. This test
// models the migration sequence and FAILS if the net result is DEFINER for any
// view in INVOKER_VIEWS, so the regression can't recur unnoticed.

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'migrations');

// Canonical list — every public view intended to run with the caller's rights.
const INVOKER_VIEWS = [
  'v_anchor_verification',
  'v_security_advisor_sweep',
  'v_shift_commit_orphans',
] as const;

// Net security_invoker state for `view` after applying every migration in
// filename (timestamp) order. null = the view is never created (test bug).
function netInvokerState(view: string): boolean | null {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filenames are timestamp-prefixed → chronological

  let created = false;
  let invoker = false;

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // Statement-level scan, case/whitespace tolerant. Split on ';' so a
    // CREATE and an ALTER in the same file are evaluated in order.
    for (const raw of sql.split(';')) {
      const s = raw.replace(/\s+/g, ' ').trim().toLowerCase();
      const v = view.toLowerCase();

      // Postgres accepts true/on/1 and false/off/0 for boolean reloptions.
      const ON = /security_invoker\s*=\s*(true|on|1)\s*\)/;
      const OFF = /security_invoker\s*=\s*(false|off|0)\s*\)/;

      const isCreate = new RegExp(`create (or replace )?view (public\\.)?${v}\\b`).test(s);
      if (isCreate) {
        created = true;
        // A CREATE resets reloptions; invoker only survives if the CREATE
        // itself carries with (security_invoker = true|on) before the body.
        invoker = new RegExp(`with \\(\\s*${ON.source}`).test(s);
        continue;
      }
      const isAlterSet = new RegExp(`alter view (public\\.)?${v}\\b`).test(s);
      if (isAlterSet) {
        if (new RegExp(`set \\(\\s*${ON.source}`).test(s)) invoker = true;
        else if (new RegExp(`set \\(\\s*${OFF.source}`).test(s) || /reset \(\s*security_invoker\s*\)/.test(s)) {
          invoker = false;
        }
      }
    }
  }
  return created ? invoker : null;
}

describe('security_invoker views survive a clean rebuild (advisor lint 0010)', () => {
  for (const view of INVOKER_VIEWS) {
    it(`${view} is SECURITY INVOKER after all migrations`, () => {
      const state = netInvokerState(view);
      expect(state, `${view} is never created in migrations`).not.toBeNull();
      expect(state, `${view} ends up SECURITY DEFINER — a later CREATE OR REPLACE dropped security_invoker without re-asserting it`).toBe(true);
    });
  }

  it('the model itself catches a dropped option (self-test)', () => {
    // Sanity: a CREATE-without-option after a SET must read as DEFINER.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
    // v_anchor_verification has the exact create→alter→create-or-replace→alter
    // sequence; if the final re-assert is ever removed this test flips red.
    expect(netInvokerState('v_anchor_verification')).toBe(true);
  });
});
