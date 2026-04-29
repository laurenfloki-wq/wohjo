# Worker FAQ — FLOSTRUCTION

> **[VOICE: needs Lauren]** — every answer below is in Cowork
> drafting voice. Lauren rewrites in plain Australian construction-
> worker register. Structure (questions + section ordering + length
> targets ~60 words per answer) is locked from the L3.5 worker-
> facing documentation scaffolding decision. Voice is editable.
>
> Reference: `Desktop/worker-facing-docs-2026-04-25.md` (L3.5),
> `Desktop/L2.2-worker-outcome-gate-2026-04-25.md` (12 outcome
> scenarios — most of these questions surface in those scenarios),
> `Desktop/L3.1-worker-advocacy-2026-04-25.md` (worker rights base).

**Last updated:** [VOICE: needs Lauren — populate on first publish]
**Audience:** A construction worker who left school after Year 10,
opening FLOSTRUCTION on their phone for the first time.

---

### What is this app?

[VOICE: needs Lauren] FLOSTRUCTION is a verified-hours record for
construction workers. You tap to start your shift, tap to take a
break, tap to end. Your supervisor confirms by SMS. The hours you
worked become a permanent record — accurate, timestamped, and
yours to keep.

*(Reference: L2.2 Outcome Gate — "FLOSTRUCTION strictly superior
to paper" framing.)*

### Do I have to download anything?

[VOICE: needs Lauren] No. FLOSTRUCTION runs in your phone's web
browser. The first time you sign in, your phone will offer to
"Add to Home Screen" — tap that and an icon appears that opens
the app like any other. There's nothing to install from an app
store.

*(Reference: PWA + Add-to-Home-Screen prompt — `src/components/
field/AddToHomeScreenPrompt.tsx`.)*

### What if I lose my phone?

[VOICE: needs Lauren] Your records aren't on the phone. They're
on FLOSTRUCTION's server, sealed and protected. Sign into your
new phone with your phone number — the same number you use now —
and your full history is there. Tell your supervisor as soon as
possible so they know what happened.

*(Reference: L2.2 Scenario 10 — stolen-phone outcome gate.
Sign-in anomaly system per L2.1 chunk 2 watches for new-device
sign-ins and pings your supervisor.)*

### What if I forget to clock out?

[VOICE: needs Lauren] FLOSTRUCTION notices when you've been off
site for more than two hours and asks you to confirm what time
you actually finished. You pick the right end time; that's what
gets recorded. No need to remember — the app helps.

*(Reference: L2.2 Scenario 1 — forgotten clock-out.)*

### What if my supervisor is away?

[VOICE: needs Lauren] Your shift is recorded the moment you
clock out, even if your supervisor doesn't reply right away.
The record itself doesn't depend on supervisor approval — it's
already sealed in the chain.

If your supervisor doesn't approve within 24 hours, contact
FLOSMOSIS directly (support@flosmosis.com). The founder reviews
delayed approvals manually and works with your labour-hire
company to escalate. Automated email fallback is being rebuilt;
until then, the manual path is the supported route.

*(Reference: L2.2 Scenario 7 — supervisor refuses. The original
automated email-fallback cron was disabled 2026-04-29 per
substrate-DD audit; revival is gated on schema migration + status
enum decision + tests per
`src/app/api/cron/approval-fallback/route.ts` revival conditions
1–7. Until revival, the manual escalation path documented above
applies.)*

### What happens to my hours if the app crashes?

[VOICE: needs Lauren] Nothing. If you've tapped CLOCK_IN or
CLOCK_OUT, that record is saved on your phone before it goes to
the server. When the app restarts, it sends the record up. You
don't lose work because of a crash.

*(Reference: P7-C1 client_event_id idempotency wiring + offline
queue at `src/lib/offline/queue.ts`.)*

### Can my boss change my hours after I clock out?

[VOICE: needs Lauren] No. Once you tap CLOCK_OUT and confirm
your hours, the record is sealed. Sealed means nobody — not
your supervisor, not your boss, not FLOSMOSIS — can quietly
change the numbers. If anyone tries, the change is visible.

*(Reference: WLES v1.0 cryptographic sealing; see
`src/content/worker/what-is-the-seal.md`.)*

### What does "verified" mean?

[VOICE: needs Lauren] It means three things. (1) Your tap was
recorded the moment you tapped — not later. (2) Your phone's
GPS confirmed you were at the site. (3) Your supervisor saw
the shift and either approved it or flagged it. All three
have to add up before the shift counts as verified.

*(Reference: WLES v1.0 spec; INTELLIGENCE rules engine.)*

### How is this different from paper timesheets?

[VOICE: needs Lauren] Paper can be lost, rewritten, or quietly
changed. The app can't. Your hours are timestamped to the
second, GPS-confirmed, and sealed. If there's ever a dispute,
the FLOSTRUCTION record is what holds up — not someone's
memory.

*(Reference: L2.2 Outcome Gate — paper baseline comparison.)*

### What if I work somewhere with no signal?

[VOICE: needs Lauren] Tap normally. The app saves your taps on
your phone and sends them up when signal returns. Whether that's
ten minutes or six hours, the record is the same — it knows what
time you actually tapped.

*(Reference: L2.2 Scenario 3 — no-coverage offline queue.)*

### Can I see my hours from previous weeks?

[VOICE: needs Lauren] Yes. Tap "My records" in the app. You'll
see every shift you've ever worked through FLOSTRUCTION. You can
download them as a CSV (opens in Excel) or as PDF receipts (one
per shift). Take them anywhere — to a tribunal, a new employer,
your accountant. They're yours.

*(Reference: L3.1 right-to-export endpoint at
`src/app/api/worker/records/export/route.ts`.)*

### Who sees my GPS location?

[VOICE: needs Lauren] Only at the moments you tap. Not while
you're working, not while you're on break, not after you clock
out. The location is used to confirm you were at the right site
— that's all. Your supervisor sees it. FLOSMOSIS staff can see
it only if you ask us to look at a specific shift. Nobody else.

*(Reference: Privacy Policy §2.2; legal-review/gps-capture-truth.md
— GPS captured at CLOCK_IN/CLOCK_OUT only.)*

---

## What's not in this FAQ (and why)

The following are intentionally not covered here:
- Pay rate questions — FLOSTRUCTION verifies hours, not pay
- Award entitlement questions — speak to your employer / Fair
  Work
- Tax / super questions — speak to your accountant / payroll
  provider
- Disputes that involve more than your hours — see `your-
  rights.md` for the dispute path

[VOICE: needs Lauren] If you have a question not on this list,
email **support@flosmosis.com** — we respond within one business
day.
