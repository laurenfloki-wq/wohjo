# TypeScript Strict Mode Audit — 2026-05-10

## Flags audited

| Flag | Pre-audit errors | Post-audit errors | Decision |
|---|---|---|---|
| `noImplicitReturns` | 0 | 0 | Enabled |
| `noFallthroughCasesInSwitch` | 0 | 0 | Enabled |
| `noImplicitOverride` | 0 | 0 | Enabled |
| `exactOptionalPropertyTypes` | 21 | 0 | Enabled (after fixes) |
| `noUncheckedIndexedAccess` | 236 | — | Deferred (>50 threshold) |

All four flags are now active in `tsconfig.json`.

## What was fixed for `exactOptionalPropertyTypes`

The flag prevents assigning `undefined` explicitly to optional properties
(`prop?: T`) — you must either omit the property or use a conditional spread.
21 sites were fixed across 9 files.

### Pattern A — conditional object spread in plain objects (4 sites)

`src/lib/wles/v1.ts` — `failures.push` passing `single.expected`, `single.actual`,
`single.message` (all optional in `SingleEventVerificationResult`).

`src/app/api/exports/myob/route.ts` — `notes`, `start_time`, `stop_time`
mapped from DB rows using `|| undefined`; replaced with `...(x ? { key: x } : {})`.

`src/app/api/field/records/route.test.ts` — `wireShiftsQuery({ rows: opts.shifts, recorded: ... })`
where both source props are optional; replaced with conditional spreads.

`src/app/api/field/shift/start/route.ts` — geolocation `accuracy` field.

### Pattern B — conditional spread in function call arguments (1 site)

`src/app/api/worker/mfa/issue/route.ts` — `firstName` extracted to a local
variable, then `...(firstName ? { firstName } : {})` spread into the email call.

### Pattern C — JSX conditional prop spread (2 sites)

`src/app/(field)/field/home/page.tsx` — two `<FieldErrorPanel receiptId={...} />`
usages where `receiptId` is `string | undefined`; replaced with
`{...(x !== undefined ? { receiptId: x } : {})}`.

### Pattern D — framer-motion `animate` / `whileHover` / `whileTap` (13 sites)

All framer-motion motion components used `animate={condition ? value : undefined}`
and `whileHover={reduced ? undefined : value}`. Under `exactOptionalPropertyTypes`
these explicit `undefined` assignments fail.

Fix: lift to JSX spread — `{...(condition ? { animate: value } : {})}`.

Files affected:
- `src/app/get-started/page.tsx` (5 components: PrimaryCTA, SecondaryCTA,
  TrustSignal, DemoPanel, SealButton)
- `src/app/get-started/Receipt.tsx` (5 sites: ReceiptCard, FadeIn, HashLine
  char, HashLine ellipsis, IntactLine)
- `src/app/get-started/Timeline.tsx` (3 sites: TimelineRow, step number dot,
  connecting rule)

## Deferred: `noUncheckedIndexedAccess`

236 errors at audit time. Every array index access (`arr[i]`) and object key
access (`obj[key]`) becomes `T | undefined`. Fixing 236 sites introduces
substantial `!` non-null assertions or guard clauses that trade safety theatre
for readability loss. Revisit when the codebase is larger and index-access bugs
have actually been caught in production.

## `tsconfig.json` changes

```diff
+    "noImplicitReturns": true,
+    "noFallthroughCasesInSwitch": true,
+    "noImplicitOverride": true,
+    "exactOptionalPropertyTypes": true,
   "exclude": ["node_modules", "scripts", ".claude"]
```

The `.claude` directory (agent worktrees) is also excluded to prevent agent-
generated test files from entering the compilation graph.
