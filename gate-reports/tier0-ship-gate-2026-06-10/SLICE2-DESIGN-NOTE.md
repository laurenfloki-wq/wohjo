# CP-1 slice 2 (shifts/shift_events) — design note & handoff, 2026-06-10

Status: NOT STARTED in code — deliberately. This note is the session's deliverable for the
slice: the route inventory, the scope-seam finding that needs spine eyes before the
mutation routes move, and the sub-slice plan. Starting a money-path refactor on residual
session budget is the failure mode the slice brief warns against.

## Route inventory (touching ONLY shifts/shift_events — verified by table-grep at HEAD)
Read-path (factory pattern fits directly):
- command/audit-trail (shift_events)            — companyId-scoped
- command/intelligence (shifts, shift_events)   — companyId-scoped
- command/super-evidence (shifts, shift_events) — companyId-scoped
- field/shifts/week (shifts)                    — worker-self-scoped (workerSelfRepo pattern)
- intelligence/analyse/[shiftId] (shifts)       — inspect scope before binding

Mutation-path (money path; the careful four):
- command/shifts/[shiftId]/{adjust,approve,correct,dispute} (shifts + shift_events)

## The seam finding (needs spine pre-approval before mutation routes migrate)
The mutation routes use FETCH-THEN-AUTHORIZE: an UNSCOPED shift lookup by id resolves
company_id, then requireCompanyMembership(shift.company_id) gates everything after
(verified in approve/route.ts; the unscoped read is intentional — scope is not known
until the row is read). A companyId-bound factory cannot express that first read without
either (a) adding a company predicate the current query does not have (behaviour delta —
banned in this slice) or (b) an explicitly-named unscoped lookup accessor.

Proposed seam, for spine review:
  - `shiftAuthLookup(shiftId)` in the shifts repo module — does exactly the current
    unscoped `select(...).eq('id', shiftId).single()`, named and documented as the
    fetch-then-authorize entry point whose ONLY legitimate caller pattern is
    "immediately followed by requireCompanyMembership(row.company_id)".
  - All post-auth queries move behind `shiftsRepo(companyId)` / `shiftEventsRepo(companyId)`
    factories with query shapes byte-identical to today (including the chain-tail and
    legacy-detection queries, which are worker- and event-type-scoped respectively and
    deliberately carry no company predicate — relocate verbatim, do not "fix").
  - The optimistic-lock UPDATE keeps `.eq('id').eq('status')` exactly; adding
    `.eq('company_id')` would be defensible defence-in-depth but is a behaviour delta —
    if wanted, it is an SG-1/P-B change with its own test, not part of this slice.

## Sub-slice plan
- 2a: read-path five (above) — straightforward factory migration, source-string guard
  sweep first.
- 2b: mutation four — after spine approves the seam. Each relocated query verbatim;
  guard tests follow invariants into the repo (worker-card-ids pattern).
- Then exports/tenant_activity_mappings/worker_record_exports repos unblock the
  multi-table export routes (scope keys per the slice brief: worker_record_exports binds
  on worker_id; tenant_activity_mappings has NO tenant column — scoping model decision
  required, do not force company_id).

## Carried items — CLOSED this session
- TLS posture closed-by-source: drift-gate.yml pins sslmode=verify-full + committed CA;
  secret is credentials+host only (trimmed 2026-06-10T02:52:58Z); dispatch run 27249893546
  green one second later. PR #69 + proof comment.
- Smoke labels 12→17 fixed incl. check-run name (renamed before CP-8 required-check wiring).
