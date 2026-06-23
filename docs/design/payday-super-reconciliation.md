# Design — Payday Super reconciliation (approved → exported → paid → supered)

**Work-order item #14.** A design (not yet built) for reconciling every approved
shift through to super-paid, driven by the **Payday Super** reform.

> **Status: design/proposal.** It states what the ledger already owns, what is
> external, and what must be built. No code in this doc.

---

## 1. Why now — the regulatory driver
Australia's **Payday Super** reform commences **1 July 2026**: superannuation
guarantee contributions must reach the employee's fund within **7 business days**
of payday (rather than quarterly). **Labour-hire contractors are explicitly
captured.** For a labour-hire hours-verification product this turns "were the
right hours approved?" into "were the right hours approved, paid, **and supered
on time**?" — a reconciliation obligation with a hard SLA.

Non-negotiable principle (standing): **never silently drop an approved shift.** An
approved shift that doesn't make it into a pay run / export must be surfaced for a
**logged include/hold decision**, never quietly aged out.

---

## 2. The lifecycle and who owns each state

| State | Meaning | Owned by | Evidence today |
|---|---|---|---|
| **APPROVED** | hours signed off | **FLOSTRUCTION** | sealed `SUPERVISOR_APPROVAL` then `PAYROLL_APPROVAL` events |
| **EXPORTED** | sent to payroll (e.g. MYOB) | **FLOSTRUCTION** | sealed `EXPORT_RECORD` event + pay-run export |
| **PAID** | wages actually paid | **external** (payroll/bank) | not visible in FLOSTRUCTION today |
| **SUPERED** | super contribution received by the fund | **external** (super clearing house / fund) | not visible today |

**The core gap:** FLOSTRUCTION authoritatively owns `APPROVED → EXPORTED` (both are
sealed WLES events it writes). `PAID` and `SUPERED` happen in the downstream
payroll + super-clearing systems and are **not fed back** today. So the product
can reconcile the first hop precisely and the last two only once a feedback path
exists.

---

## 3. What can be reconciled now (build first — no external dependency)

**APPROVED-not-EXPORTED aging.** Every `PAYROLL_APPROVAL` with no subsequent
`EXPORT_RECORD` covering it is an approved-but-unexported shift. This is fully
derivable from the ledger today and is the highest-value, lowest-dependency piece.

- A reconciliation surface (view + cron, mirroring the existing
  `v_shift_commit_orphans` / `shift_commit_completeness` pattern) that lists each
  approved-not-exported shift with its **age in business days**.
- **Aging SLA tied to the super deadline:** because super is due 7 business days
  after payday, an approved shift must be exported (and paid) with enough runway.
  Surface at, say, **T-3 business days** so there's time to act, and escalate
  (ops alert) as it approaches the deadline.
- Each surfaced item requires a **logged include/hold decision** (who, when, why)
  — satisfying "never silently drop." The decision itself should be a recorded
  event so the audit trail is complete.

## 4. What needs an external feedback path (build second)

**PAID and SUPERED confirmation.** To close the full chain FLOSTRUCTION must
*ingest* confirmation from downstream:

- **PAID:** either a payroll-system export-acknowledgement import (CSV/API from
  MYOB or the bureau), or a manual "marked paid" with a pay-date, recorded against
  the pay run. Minimum data: pay-run id, pay date, amount.
- **SUPERED:** a super clearing-house / fund confirmation (SuperStream message,
  clearing-house webhook, or a periodic statement import). Minimum data: employee,
  period, contribution amount, **date received by fund** (the clock that the 7-day
  rule measures).
- Reconciliation then asserts, per approved shift: exported ✓, paid ✓ (pay date),
  supered ✓ **within 7 business days of pay date** — and goes RED + alerts on any
  breach or missing leg.

## 5. Reconciliation states (proposed)

```
APPROVED ──► EXPORTED ──► PAID ──► SUPERED-ON-TIME            (green path)
   │            │           │           └─ SUPERED-LATE        (breach → alert)
   │            │           └─ PAID-NOT-SUPERED (aging → alert at T-1)
   │            └─ EXPORTED-NOT-PAID (aging)
   └─ APPROVED-NOT-EXPORTED (aging → include/hold decision)    ← build first
```

## 6. Build order
1. **Now:** APPROVED-not-EXPORTED aging surface + business-day SLA + logged
   include/hold decision (ledger-only; no external dependency).
2. **Before 1 Jul 2026:** PAID feedback (pay-date capture) and SUPERED feedback
   (fund-receipt date), then the on-time assertion + breach alerting.
3. Fold the breach checks into `substrate-health` worst-of so a super-timing
   breach shows on the same trust surface as ledger integrity.

## 7. Open questions for Lauren
- Which payroll system(s) are in scope at launch (MYOB confirmed; others?) and can
  they emit a paid-confirmation we can import?
- Which super clearing house, and does it expose a programmatic receipt date?
- Business-days calendar source (national vs state public holidays) for the SLA.
