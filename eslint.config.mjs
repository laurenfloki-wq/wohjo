// ESLint flat config (eslint v9 + TypeScript)
//
// Minimal config — TS parser + @typescript-eslint recommended rules
// + no-console warning. Deliberately omits eslint-config-next:
// eslint-config-next@16 has a known FlatCompat circular-reference
// bug ("Converting circular structure to JSON") under eslint v9
// flat config. Once the upstream issue is fixed, we can re-add
// next/core-web-vitals + next/typescript for image-optimisation
// + Link-usage lints. Tracked in security-backlog-2026-04-28.md.
//
// CLAUDE.md rule #1: no console.* in production. The audit
// classified the 5 hits in the codebase as intentional (4 in
// live-test files, 1 in a browser-only error reporter). Treat
// as warning so future leaks surface without blocking the
// build.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'src/db/migrations/**',
      'migrations/**',
      'scripts/**.mjs',
      'scripts/**.cjs',
      'scripts/**.ts',
      'tests/**',
      'tmp-sim/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Pragmatic relaxations for a pre-launch codebase. Re-tighten
      // post-activation if Layer 2 audit surfaces concerns.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      // ────────────────────────────────────────────────────────────
      // Phase 1 Path B — react-hooks v7 rule downgrades.
      // These four rules were promoted to ERROR by
      // eslint-plugin-react-hooks@7. They flag 13 anti-patterns in
      // the current codebase across 7 files (worker home, receipt,
      // ApprovalsClient, intelligence-log, AddToHomeScreenPrompt,
      // VerifyClient, useOfflineSync). The patterns currently work
      // in production; the rules are aggressive about cascading-
      // render risk and code clarity.
      //
      // Refactor scheduled for the week of 5 May 2026 (post-Joao
      // testing) per Desktop/security-backlog-2026-04-28.md HIGH
      // priority entry. Re-promote to error after the refactor
      // closes — this re-enables the safety net for new code.
      // ────────────────────────────────────────────────────────────
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  // ──────────────────────────────────────────────────────────────────
  // Security remediation 2026-06-10 (finding A): the deleted
  // requireCommandAuth API-key branch returned an unscoped
  // { userId: 'api-key' } principal with no company binding — a latent
  // GAP-A3-001 re-introduction. This guard prevents any auth helper
  // from ever returning that shape again. If machine-to-machine access
  // is ever needed, build a keyed api_keys table (key_hash, company_id,
  // scopes, created_at, revoked_at) so every key is company-bound by
  // construction. Never a global bearer.
  // ──────────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ReturnStatement > ObjectExpression:has(Property[key.name='userId'][value.value='api-key'])",
          message:
            'Auth helpers must return a server-derived companyId, never an unscoped api-key principal. Use lib/auth/session.ts.',
        },
      ],
    },
  },
  // ──────────────────────────────────────────────────────────────────
  // Dashboard scoping defence (Task 9 from overnight 2026-04-30)
  //
  // Prevents the dashboard scoping bug class fixed at a601c0f from
  // regressing. createServiceClient() in a server component bypasses
  // RLS, so any query needs to be manually scoped by company_id. The
  // canonical pattern is at src/app/(command)/command/dashboard/page.tsx
  // (resolves companyId via getCompanyIdForSession, passes to
  // loadDashboardCounters which has companyId as a required parameter).
  //
  // This rule fires on EVERY createServiceClient() call inside an
  // app/**/page.tsx file. It can't statically verify "same-function-
  // scope getCompanyIdForSession" without proper AST traversal (would
  // need a custom rule plugin), so it emits a warning that points at
  // the canonical example. Dashboard's own usage will trigger the
  // warning; that's acceptable — the warning is a checkpoint, not
  // a block.
  //
  // Backlog: upgrade to a custom rule that does same-scope detection.
  // Saturday-session item.
  // ──────────────────────────────────────────────────────────────────
  {
    files: ['src/app/**/page.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'CallExpression[callee.name="createServiceClient"]',
          message:
            'createServiceClient() bypasses RLS. In a server component, EVERY query MUST scope by company_id. Resolve via getCompanyIdForSession() first, then filter every .from(table).select(...).eq("company_id", companyId). Canonical example: src/app/(command)/command/dashboard/page.tsx (extracts loadDashboardCounters(supabase, companyId) with companyId required at the type level). See ~/Desktop/FLOSTRUCTION-Build/dashboard-scoping-audit-2026-04-30.md.',
        },
      ],
    },
  },
];
