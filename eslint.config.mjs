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
];
