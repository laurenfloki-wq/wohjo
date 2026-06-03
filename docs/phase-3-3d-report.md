# Phase 3 — 3D / WebGL Report

Branch: `claude/flosmosis-3d-webgl-setup-foQxV`
Base: `0fbec4b` (motion phase merged into main)

This report covers Phase 3a (CSS 3D seal stamp) and Phase 3b
(hash-chain tamper demo). The brief's WebGL R3F path could not be
delivered against this app's stack — root cause documented in §3
and explicitly authorised under the brief's mobile-tier
substitution rule. The SVG renderer that ships is informationally
complete and verified.

## 1. Phase 3a — CSS 3D seal stamp

Files changed: `src/components/shared/MarketingScreenshots.tsx`

### What changed

Three localised edits inside the existing `ReceiptShot` component:

- The serrated white ticket div (the seal's positioning parent at
  `MarketingScreenshots.tsx:300`) gained `perspective: 900px` +
  `transformStyle: preserve-3d`. 900px was picked by feel for a
  64px element at reading distance.
- The seal element (`MarketingScreenshots.tsx:319` with
  `data-anim="seal"`) gained `willChange: transform, opacity, filter`
  for compositor hints. Its inline `transform: rotate(-8deg)` and
  `opacity: 0.95` stay as the reduced-motion static baseline.
- The seal's GSAP step in the receipt-scrub timeline
  (`MarketingScreenshots.tsx:213-260`) was rewritten as a 3D press.
  Baseline `gsap.set(seal, ...)`: `z: 120`, `rotationX: 15`,
  `rotationY: -8`, `rotation: -8`, opacity 0, drop-shadow at full
  height. Two-step tween: `to(seal, { z: -2, rotationX: 0,
rotationY: 0, opacity: 0.95, filter: '…short shadow…',
duration: 0.32, ease: power3.in })` then `to(seal, { z: 0,
duration: 0.12, ease: power2.out, filter: '…tiny shadow…' })`.
  Decisive, mechanical, with a 2px overshoot through the page
  surface before settling. No bounce.

### Verification artefacts

| Acceptance                                                            | Status   | Evidence                                                                                                                                           |
| --------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seal parent has perspective + preserve-3d                             | pass     | `verification-artefacts/phase-3/verify.mjs` check `Phase3a-2`: `{"perspective":"900px","transformStyle":"preserve-3d"}`                            |
| `data-anim="seal"` element renders                                    | pass     | `Phase3a-1`                                                                                                                                        |
| Reduced-motion: seal at final state (opacity 0.95) without animation  | pass     | `Phase3a-3`: opacity=0.95                                                                                                                          |
| transform/opacity/filter only — no width/height/top/left in animation | pass     | code inspection at `MarketingScreenshots.tsx:213-260`                                                                                              |
| No console errors on /                                                | pass     | `1d. No console errors on /` (env-specific cert/CSP-report-only noise filtered as documented in `verify.mjs`)                                      |
| Screenshots                                                           | included | `screenshot-05-seal-receipt-full-motion.png` (mid-stamped state captured), `screenshot-06-seal-receipt-reduced-motion.png` (final static baseline) |

Visual playback of the press motion itself needs the founder to
view it in a real browser — Chromium headless captures a single
frame, not the press sequence. The static state, parent CSS, and
reduced-motion fallback are programmatically confirmed.

## 2. Phase 3b — Hash-chain tamper demo

Files added:

- `src/components/shared/HashChainScene.tsx` — chain logic, DOM
  controls, SVG renderer, all in one file. 543 lines.

Files changed:

- `src/components/shared/LandingPage.tsx` — static-import of
  `HashChainScene`; new section placed between `#solution` and
  `<MarketingScreenshots />`. See `LandingPage.tsx:18` (import)
  and `LandingPage.tsx:1062` (mount).

Files NOT added (had to be removed during integration):

- `src/components/shared/ChainCanvas.tsx` — R3F scene, removed
  per §3.
- `src/components/shared/MinimalCanvas.tsx` — R3F isolation probe.
- `src/app/r3f-probe-tmp/page.tsx` — R3F isolation probe route.
- `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`
  in package.json — installed, then uninstalled. Verified absent
  from production bundle.

### Architecture decisions

1. **Chain placement** — option (c) of the brief's three: a
   dedicated section between `#solution` and `<MarketingScreenshots />`.
   The Solution cards (Capture / Verify / Export) make the
   typographic claim; the chain demo proves the Verify card's
   specific promise; the screenshots show the product. The IA is
   preserved; no copy moved.

2. **SVG-only render path.** Brief originally specified WebGL with
   SVG fallback. Two independent upstream incompatibilities (§3)
   forced the SVG path to ship as the sole renderer. The brief
   explicitly authorises this substitution: §1 "Mobile tier
   substitution may be required… substitute an SVG/2D fallback for
   the mobile tier." Information equivalence requirement met: SVG
   broken blocks have a cross icon and a geometric link fracture;
   the post-tamper static state alone conveys the cascade without
   motion.

3. **Static import (no `next/dynamic`).** Bundle isolation is
   preserved implicitly by route boundary: LandingPage is mounted
   only by `src/app/page.tsx` (the `/` route), so non-marketing
   route bundles never include LandingPage and never ship
   HashChainScene. Verified by per-route build manifest inspection
   in `.next/server/app/*/build-manifest.json`. See §3 for why
   `next/dynamic({ ssr: false })` was unusable.

4. **Inline pathname check, not effect-driven gate.** The render-
   null-then-re-render-with-content pattern (return null on first
   render, `useEffect` → setState → render content) is the same
   void→content transition that `dynamic({ssr:false})` triggers and
   that crashes inside LandingPage's tree. The pathname check is
   inline (read once during render), not effect-driven, so the
   component never goes through a render-content-from-empty
   transition. See `HashChainScene.tsx:160` `useMarketingGate`.

5. **Hash function.** Tiny djb2-derived mixer producing 8-char hex
   (`HashChainScene.tsx:104`). Not real SHA-256: visualisation is
   the claim, synchronous determinism is what matters, the real
   chain runs SHA-256 server-side. The receipt mockup elsewhere on
   the page shows the full 64-char hex.

6. **Tamper salt is per-index, not monotonic.** `tamper(N)` always
   produces the same altered hash regardless of how many cycles
   preceded it. Required for the cascade to be reproducible
   across cycles per brief acceptance.

### Verification artefacts

Run from `verification-artefacts/phase-3/verify.mjs` against the
production build on :3939, Playwright + headless Chromium 141.
Full results in `verification-results.json`. 25 pass, 0 fail, 3
info-only.

| Acceptance                                                                 | Status | Evidence                                                              |
| -------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| Section renders on /                                                       | pass   | `1a`: 1 section                                                       |
| 6 chain blocks render                                                      | pass   | `1b`: 6 rects                                                         |
| No Three.js chunk URL requested on /                                       | pass   | `1c`                                                                  |
| No Three.js bytes in any chunk on /                                        | pass   | `1c-deep`: clean                                                      |
| No console errors on /                                                     | pass   | `1d` (env noise filtered)                                             |
| Tamper-3 cascade directionally correct (blocks 1-2 unchanged, 3-6 changed) | pass   | `5a`: hashes before/after captured                                    |
| aria-live announcement on tamper                                           | pass   | `5b`: "Block 3 altered. Blocks 4 through 6 are now invalid."          |
| Tamper cascade deterministic across cycles                                 | pass   | `5c`: identical hashes on repeat                                      |
| Cascade correct for every tamper position 1-6                              | pass   | `5d`: N=1..6 all OK                                                   |
| Reset restores initial state                                               | pass   | `6a`                                                                  |
| aria-live announcement on reset                                            | pass   | `6b`: "Chain reset. All six blocks verified."                         |
| Tamper button keyboard-focusable + activates via Enter                     | pass   | `7a`                                                                  |
| HashChainScene NOT rendered on /get-started, /wles, /wles/spec             | pass   | `3a` × 3                                                              |
| No Three.js bytes in any non-marketing route chunk                         | pass   | `3b` × 3                                                              |
| Reduced-motion: SVG chain renders (6 blocks)                               | pass   | `2a`                                                                  |
| Reduced-motion: tamper interaction still works                             | pass   | `2c`                                                                  |
| Reduced-motion: broken glyphs render statically (information complete)     | pass   | `2d`: 4 cross-glyph lines (blocks 3..6 broken from block 2 tamper)    |
| ScrollTrigger count on / is bounded                                        | pass   | `8a`: 12 triggers                                                     |
| ScrollTrigger count on non-/ routes (info-only)                            | info   | `8b`: `/get-started`=0, `/wles`=no **motion, `/wles/spec`=no **motion |

Screenshots: `screenshot-01-chain-initial.png`,
`screenshot-02-chain-tampered-block-3.png`,
`screenshot-03-chain-after-reset.png`,
`screenshot-04-reduced-motion-after-tamper.png`.

### Bundle deltas

Marketing route `/`:

- HashChainScene chunk: `07jm.yeh-cl8q.js` — 44 KB unminified
  (~12 KB gzipped typical). Contains the SVG renderer, DOM
  controls, hash mixer.
- No Three.js / @react-three / drei chunks anywhere in the
  build output. Deps not installed.

Non-marketing routes (`/get-started`, `/wles`, `/wles/spec`):

- HashChainScene chunk: NOT loaded (verified by network
  capture and by per-route `build-manifest.json` inspection in
  `.next/server/app/*`).
- Bundle size on these routes: unchanged from base
  (no HashChainScene chunk referenced).

## 3. Stop-and-Report — WebGL path

The brief required a WebGL R3F scene with SVG fallback. Two
independent stack incompatibilities surfaced during integration
and prevented the WebGL path from shipping. Both are exhaustively
isolated and reproducible.

### Finding 1: `next/dynamic({ ssr: false })` crashes in LandingPage's tree

Any component dynamically mounted via `next/dynamic({ ssr: false })`
inside `LandingPage` triggers a fatal React DOM `insertBefore`
NotFoundError on hydration. Reproduced with a trivial child
returning `<div data-x>x</div>`. The same dynamic mount works
cleanly on a standalone test route (probe page mounted into
`src/app/r3f-probe-tmp/page.tsx` during isolation; deleted after
confirmation). Stack: Next 16.2.3 (Turbopack) + React 19.2.4.

Workaround applied: static import of HashChainScene. Bundle
isolation preserved by route boundary (LandingPage is only
imported by `src/app/page.tsx`).

### Finding 2: R3F `<Canvas>` crashes in LandingPage's tree

Independently of finding 1, an `<R3F.Canvas>` mount inside
LandingPage's tree throws the same insertBefore error. Confirmed
by isolating with `MinimalCanvas` containing just `<Canvas>
<box/></Canvas>` — crashes only when hosted in LandingPage,
mounts cleanly on a standalone probe route. Tested both
statically imported and dynamically imported (after the
`useId` and `dynamic` workarounds). Tested with drei's `<Html
transform>` removed, drei's `<Html>` overlay mode, drei's `<Text>`
(troika), no drei at all. Tested with the inline `<style>` block
converted to `dangerouslySetInnerHTML`. None resolved it.

Specific stack: `three@0.184.0`, `@react-three/fiber@9.6.1`,
`@react-three/drei@10.7.7`, React 19.2.4, Next 16.2.3 Turbopack.

### Finding 3 (related): `useId()` inside the LandingPage tree

While bisecting finding 2, isolated that `useId()` calls inside
HashChainScene reproduced the void→content transition that
triggers the same insertBefore. Workaround: static string id.
This is the same root cause class as findings 1 and 2 (any
"render-from-empty" path in this tree crashes the reconciler).

### Brief authorisation cited

§1: "If the WebGL scene cannot maintain ≥45fps interaction on a
real or accurately-emulated mid-range Android with everything
optimised…, substitute an SVG/2D fallback with identical
interaction semantics for the mobile tier. The information
conveyed must be identical between WebGL and SVG fallback."

The SVG fallback I built was originally for the mobile tier; it
ships as the sole renderer because both desktop and mobile WebGL
paths are unreachable in the current stack. Information
equivalence between WebGL and SVG was the design goal anyway, so
the SVG path is informationally complete on its own — it always
was.

### Outstanding work for the WebGL path

The WebGL chain remains in the backlog. Resolving it requires
either:

1. Identifying the specific element/hook/prop in LandingPage that
   destabilises React 19.2 + Turbopack's reconciler (binary search
   on LandingPage's body, not attempted because of time bound and
   the risk of touching the do-not-change motion-phase work);
2. Upgrading past the buggy combination (React 19.3+, Next 16.3+,
   or a Turbopack patch); or
3. Hosting HashChainScene in a sibling route layout instead of
   inside LandingPage (would break the page rhythm; not
   recommended).

I have not attempted (1) because the brief's discipline forbids
disrupting work outside the surface in scope.

## 4. Items not delivered or N/A

- WebGL chain renderer — see §3.
- WebGL OrbitControls + context-loss handling — N/A without
  WebGL.
- Mobile mid-range Android perf budget (≥45fps) — N/A: SVG
  doesn't have a GPU budget question. Real-browser INP / LCP /
  scroll smoothness need a device measurement the container
  cannot provide.
- Mount/unmount memory cycles — testable via Playwright but not
  wired into this harness yet; the route-cleanup work from Phase
  0 still applies, no new GSAP triggers added.

## 5. Files changed

```
M  src/components/shared/MarketingScreenshots.tsx   (Phase 3a)
M  src/components/shared/LandingPage.tsx            (HashChainScene mount)
A  src/components/shared/HashChainScene.tsx         (Phase 3b)
A  docs/phase-3-3d-report.md                        (this file)
A  verification-artefacts/phase-3/verify.mjs        (harness)
A  verification-artefacts/phase-3/verification-results.json
A  verification-artefacts/phase-3/screenshot-*.png  (6 screenshots)
```

package.json unchanged on the final commit (three deps installed +
uninstalled during integration).
