# CP-1 slice 2b — implementation spec (analysis COMPLETE, code parked), 2026-06-10

Parked under autonomous-brief stop-trigger (e): the session could not carry the slice
through its gate (context budget), and the money path does not ship unproven. The
analysis below is complete — execution is mechanical from here.

## Guardrail-1 analysis — RESULT: accessor is id + company_id ONLY
All four routes (adjust/approve/correct/dispute) follow lookup → 404 → 
requireCompanyMembership(shift.company_id) → everything else. Verified by full read:
NO field beyond company_id drives a pre-membership branch. status/receipt_id/
total_hours/start/end/break are all used post-membership (approve never uses
total_hours at all; dispute and adjust never use status). Stop-trigger (a) NOT
triggered for shiftAuthLookup.

→ `shiftAuthLookup(shiftId)` selects `id, company_id` .eq('id', shiftId).single().
→ Post-membership re-reads via shiftsRepo(companyId), per-route column lists:
   - getForAdjust: id, worker_id, site_id, receipt_id, start_time, end_time, break_minutes, total_hours, status
   - getForApprove: id, worker_id, site_id, receipt_id, status, total_hours
   - getForDispute: id, worker_id, site_id, receipt_id, status
   - getForCorrect: id, worker_id, site_id, receipt_id
   (re-read returning null → same 404 'Shift not found' as today)

## FLAGGED for spine (same seam, second table): parentEventAuthLookup
`correct` fetches the parent shift_events row UNSCOPED by id
(select 'id, company_id, worker_id, site_id, event_hash') and compares
parentEvent.company_id !== shift.company_id post-membership (403 on mismatch).
Proposal: relocate verbatim as `parentEventAuthLookup(eventId)` — the shift_events
twin of the approved seam — with the correct-route paired-guard test additionally
asserting the company comparison follows the lookup. Spine attention requested at the
SG-2 milestone gate; only company_id (and id for logging) is consumed, so a
column-minimised variant is available if the spine prefers it over verbatim.

## Verbatim relocations (do NOT "fix")
- workerChainTail(workerId): select event_hash .eq worker_id .order created_at desc .limit 1 .single()   [adjust, dispute, correct]
- workerV0ChainTail(workerId): + .eq spec_version '0', two-column order (created_at desc, id desc), maybeSingle   [approve]
- legacyFinalApproval(shiftId): event_type SUPERVISOR_APPROVAL + JSON filters event_data->>shift_id / ->>layer=FINAL   [approve]
- approve optimistic-lock UPDATE: .eq('id').eq('status','SUPERVISOR_APPROVED') EXACTLY + lock-miss refetch (select id,status .eq id .maybeSingle — unscoped post-auth read, relocate verbatim)
- adjust/dispute shifts UPDATEs: .eq('id', shiftId) ONLY — no company predicate today; adding one is SG-1/W2 with its own test. Document inline.
- Event INSERTs move to shiftEventsRepo(companyId).insertV0Event(fields) — company_id supplied by the factory binding, which equals shift.company_id by construction (membership was checked against it).
- dispute v1 path (flag-gated OFF): wrap getV1ChainTail/insertV1Event as repo pass-throughs (v1ChainTail(), insertV1(sealed, opts)) so the route never touches the raw client.

## Guardrail-2 paired-guard tests (4 files, worker-card-ids template)
Per route assert: source contains shiftAuthLookup( AND requireCompanyMembership(;
ordering: no .from('shifts') mutation (update/insert) and no repo mutation call
before the membership call; route source has no createServiceClient. Correct's test
additionally asserts parentEventAuthLookup( is followed by the company_id comparison.

## Order of work (mechanical)
1. Extend shifts.repo.ts (auth-lookup seam section + factory methods above).
2. Rewrite 4 routes via anchored replacements (all four fully read 2026-06-10; anchors
   are the import line, the lookup block, the per-query blocks quoted in this repo's
   route files at HEAD d86d371c).
3. Add 4 paired-guard test files.
4. One PR; unit suite + attestation + bulletproof green; merge; count 37 → 33.
