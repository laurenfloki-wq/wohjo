# Page Paradigm — full functionality review (2026-06-12)
Reviewer: Cowork build session, on founder instruction ("review every page, optimise to best-in-class Jobs standard").
Standard applied: dispatch SS2 doctrine (one page a day; anti-engagement; calm technology — Weiser & Brown / Case; processing fluency — Kurosu & Kashimura, NN/g, Reber et al.; calibrated trust — Lee & See; peak-end — Kahneman) + the founder test (every visual survives "what is that?" in one sentence, on the page).

## Method
Each page audited on four axes: (1) does every element render live data it can prove; (2) can the operator act where the page says they can; (3) accessibility law (focus, aria-live, keyboard, contrast CI, reduced motion, print); (4) calm — nothing begs for attention that doesn't deserve it.

## TODAY — live since Phase 1
PASS: greeting/distance-to-safe, provenance whisper, pay run card, decision queue with working Approve (existing tested endpoint), sentence-rendered Handled, on-site rows with live timer, real archive count, bad-morning derivation from anchors + health log.
GAPS (tracked): "Run when safe" enablement = pay-run state machine (next slice); reminders/roster lines in provenance render only what is real; Ask = Phase 3.

## PEOPLE — was a stub; NOW LIVE (this PR)
Founder finding confirmed: no way to add people. FIXED — inline Add-someone composer (Worker/Supervisor toggle) wired to the EXISTING tested POST /api/command/workers and /api/command/supervisors (tenant-scoped, dup-phone 409s surfaced calmly). Workers list with lifetime verified hours (sum of SUBMITTED/APPROVED/EXPORTED shift hours — tested derivation); Supervising rows show real pending-SMS queues.
DELIBERATE: worker form asks employee number + pay rate because the payroll export requires both — the dispatch's "worker completes their own details on their own phone" needs the invite/SMS machinery; PARKED with Found-for-you roster diff (needs payroll roster source). No fake door pretends otherwise.

## PAY RUNS — was a stub; NOW LIVE (this PR)
Assembling card derived from this week's sealed records; kept runs list every export with verified hours, shift count, target, and pack fingerprint from export_packs (id-keyed off the company-scoped exports read).
PARKED: state machine (assembling → safe → run → super landed) + "Run when safe" enablement — the next build slice; the button stays honestly disabled.

## SITES — was a stub; NOW LIVE (this PR)
Day-line per site from today's shifts (green sealed / amber recording, arrival time on hover + aria-label), first-site-kept-forever line, Open-a-site composer wired to existing POST /api/command/sites with the 150 m default radius per spec.
PARKED: address → geocode → lat/lng draft (needs a geocoding-provider decision — recorded, not improvised).

## THE RECORD — was a stub; NOW LIVE (this PR)
Twenty most recent events with truncated event_hash + spec version; Anchors section reads v_anchor_verification live including bound_at (the 4 June cutover) and states match/mismatch honestly.
PARKED: Ask (Phase 3, Anthropic API, read-only with row citations); per-record verify walkthrough.

## Cross-page law (verified)
Contrast CI pins every text pair >= 4.5:1; amber decorative-only; red failure-only. aria-live on rewriting sentences; visible focus; reduced-motion honoured; print stylesheet; mobile top bar; rail foot and page footer share no class; trinity line still gated (JOAO_COPY_APPROVED=false). No engagement mechanics anywhere: no badges, streaks, red dots, or feeds. Demo surface unmistakably synthetic, demo canon only, pinned by test.

## Parking lot (scope discipline, in priority order)
1. Pay-run state machine + snapshots/archive links (Phase 2 core, next slice)
2. SMS invite + worker self-completion onboarding; Found-for-you roster diff
3. Geocoding provider for Open-a-site; geofence draft from address
4. Supervisor response-time medians (needs approval-latency derivation)
5. Ask (Phase 3)
PROTOTYPE NOTE: the approved prototype shortlink expired before the four Phase-2 pages could be pixel-checked; pages are built from dispatch SS6 specs. Re-share + commit to design-branch/ then pixel-pass.
