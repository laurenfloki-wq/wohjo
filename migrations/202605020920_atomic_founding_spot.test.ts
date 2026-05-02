// Schema-drift + structural-shape guard tests for migration
// migrations/202605020920_atomic_founding_spot.sql and the
// /api/founding refactor that calls it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = fs.readFileSync(
  path.join(process.cwd(), 'migrations/202605020920_atomic_founding_spot.sql'),
  'utf-8',
);
const ROUTE = fs.readFileSync(
  path.join(process.cwd(), 'src/app/api/founding/route.ts'),
  'utf-8',
);

describe('Migration 202605020920 — allocate_founding_spot function shape', () => {
  it('declares CREATE OR REPLACE FUNCTION public.allocate_founding_spot RETURNS integer', () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.allocate_founding_spot\(\)\s*\nRETURNS integer/,
    );
  });

  it('uses FOR UPDATE row lock on founding_config for atomic decrement', () => {
    expect(MIGRATION).toMatch(
      /SELECT \(value::integer\)[\s\S]*?FROM public\.founding_config[\s\S]*?WHERE key = 'spots_remaining'[\s\S]*?FOR UPDATE/,
    );
  });

  it('returns -1 when v_remaining <= 0 (cap-reached → caller routes to waitlist)', () => {
    expect(MIGRATION).toMatch(/IF v_remaining <= 0 THEN[\s\S]*?RETURN -1/);
  });

  it('computes spot_number as 21 - remaining (canonical 1..20 indexing)', () => {
    expect(MIGRATION).toMatch(/v_spot_number := 21 - v_remaining/);
  });

  it('decrements spots_remaining via UPDATE after the read-lock', () => {
    expect(MIGRATION).toMatch(
      /UPDATE public\.founding_config[\s\S]*?SET value = \(v_remaining - 1\)::text/,
    );
  });

  it('REVOKEs EXECUTE FROM PUBLIC and GRANTs only to service_role', () => {
    expect(MIGRATION).toMatch(/REVOKE EXECUTE ON FUNCTION public\.allocate_founding_spot.*?FROM PUBLIC/);
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.allocate_founding_spot.*?TO service_role/);
  });

  it('hardens search_path = public against search_path manipulation', () => {
    expect(MIGRATION).toMatch(/SET search_path = public/);
  });

  it('raises EXCEPTION if founding_config row missing (fail-fast, no silent zero)', () => {
    expect(MIGRATION).toMatch(
      /IF NOT FOUND THEN[\s\S]*?RAISE EXCEPTION 'allocate_founding_spot: founding_config row missing/,
    );
  });

  it('does NOT auto-apply (header explicitly notes Lauren-side application)', () => {
    expect(MIGRATION).toMatch(/DO NOT auto-apply/);
  });
});

describe('/api/founding/route.ts — atomic allocator integration', () => {
  it('calls supabase.rpc("allocate_founding_spot")', () => {
    // Allow optional trailing comma + whitespace before closing paren —
    // the multi-line call style includes a trailing comma per the
    // codebase's rpc() invocation convention.
    expect(ROUTE).toMatch(/supabase\.rpc\(\s*['"`]allocate_founding_spot['"`]\s*,?\s*\)/);
  });

  it('POST handler no longer reads spots_remaining (atomic function does both read+write)', () => {
    // Isolate the POST handler section to assert the read-then-write
    // mutation pattern is gone. The GET handler at the bottom of the
    // file still reads founding_config (display-only counter for the
    // /founding page) and that is preserved.
    const postSectionMatch = ROUTE.match(
      /export async function POST\([\s\S]*?(?=export async function GET\()/,
    );
    expect(postSectionMatch).not.toBeNull();
    const postBody = postSectionMatch?.[0] ?? '';
    expect(postBody).not.toMatch(/\.from\(['"]founding_config['"]\)\s*\n?\s*\.select\(/);
  });

  it('no longer manually decrements founding_config via .update()', () => {
    // Same pattern: the manual UPDATE of spots_remaining is gone.
    // The route still has a GET handler that READS the counter
    // (line ~290+ pre-refactor, and that's preserved). The mutation
    // path no longer touches founding_config directly.
    const updateMatches = [...ROUTE.matchAll(
      /\.from\(['"]founding_config['"]\)[\s\S]*?\.update\(/g,
    )];
    expect(updateMatches.length).toBe(0);
  });

  it('handles allocator returning -1 by inserting waitlist row + 200 response', () => {
    expect(ROUTE).toMatch(/allocatedSpot === -1/);
    expect(ROUTE).toMatch(/status:\s*['"`]WAITLIST['"`]/);
    expect(ROUTE).toMatch(/waitlist:\s*true/);
  });

  it('waitlist response uses canonical "we’ve added you to the waitlist" copy', () => {
    expect(ROUTE).toMatch(/added you to the waitlist/);
    expect(ROUTE).toMatch(/Founding cohort is full/);
  });

  it('waitlist email notification subject prefix is [FOUNDING WAITLIST]', () => {
    expect(ROUTE).toMatch(/\[FOUNDING WAITLIST\]/);
  });

  it('happy-path lead insert still uses status=NEW (not WAITLIST)', () => {
    expect(ROUTE).toMatch(/status:\s*['"`]NEW['"`]/);
  });
});
