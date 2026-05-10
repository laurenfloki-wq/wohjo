# Joao weekend stress-test — 2026-05-10

Read this on your phone. Three scenarios. Each has a setup, one task, and pass criteria to check off.

---

## Scenario 1 — New worker, first open

**Setup**

- Use a phone you haven't used FLOSTRUCTION on before (or clear site data for flostruction.com in your browser settings).
- Open `/field/home` (or the home screen URL directly).

**Task**

Open the app. Do NOT log in. Navigate to each of the three advocacy pages by tapping the footer links.

**Pass criteria**

- [ ] The AdvocacyFooter is visible at the bottom of the screen without scrolling (or with minimal scroll on a 375px-width phone).
- [ ] Tapping "FAQ" opens `/field/faq` and the page renders without a white flash or login redirect.
- [ ] Tapping "How records are sealed" opens `/field/seal` and the SealedRibbonExample (✓ Sealed — Mt Stromlo | 2026-05-08 07:00) is visible on the page.
- [ ] Tapping "Your rights" opens `/field/rights` and the numbered rights list is visible.
- [ ] None of the three pages shows a login form or redirects to `/field` (the login page).
- [ ] Each page has a "See also" section at the bottom linking to the other two pages.

---

## Scenario 2 — First-time worker sees onboarding banner, dismisses it

**Setup**

- Clear `localStorage` for the site: in Chrome mobile, open DevTools → Application → Local Storage → clear `worker-onboarding-banner-shown-v1`, or use a fresh incognito tab.
- Navigate to `/field/home`.

**Task**

Observe the banner, then tap "Skip for now". Reload the page.

**Pass criteria**

- [ ] The banner appears on first load with text: "New to FLOSTRUCTION? Read what your sealed records mean and your rights as a worker."
- [ ] Both buttons have a tap target of at least 48px tall (hold your thumb — the target should feel comfortable).
- [ ] Tapping "Read now" navigates to `/field/seal`.
- [ ] After returning and tapping "Skip for now", the banner disappears immediately.
- [ ] Reloading `/field/home` after dismissal — the banner does NOT reappear.
- [ ] `localStorage.getItem('worker-onboarding-banner-shown-v1')` returns `'true'` after dismissal (check in browser console).

---

## Scenario 3 — Worker on receipt page reads the seal explanation

**Setup**

- Log in as a worker with at least one completed shift.
- Navigate to that shift's receipt page (`/field/receipt/[receiptId]`).

**Task**

Locate the SealedRibbon on the receipt. Tap "What does this mean?" and read the expanded text. Then tap the link to the full explanation.

**Pass criteria**

- [ ] The SealedRibbon shows "Sealed" label and the hash prefix in monospace text.
- [ ] A "What does this mean?" button is visible directly below the ribbon — not hidden below the fold.
- [ ] Tapping the button expands a short explanation (first ~50 words about the fingerprint).
- [ ] Tapping the button again collapses the explanation.
- [ ] The expanded panel contains a "Read the full explanation →" link.
- [ ] Tapping "Read the full explanation →" navigates to `/field/seal`.
- [ ] With a screen reader or browser accessibility inspector: the button has `aria-expanded="true"` when open and `aria-expanded="false"` when closed.
- [ ] The SealedRibbon div has `role="region"` and an `aria-label` that includes "Sealed record" and the hash prefix.
