# Directors' resolution — WLES chain-integrity known-exceptions baseline (DRAFT)

**Status: DRAFT — carries no evidentiary weight until adopted and signed.**

Company: FLOSMOSIS (WOHJO)
Date of adoption: ______________________

## Resolution

1. The company adopts `docs/evidence/chain-integrity-baseline-2026-06-12.json`
   (baseline id `WLES-CHAIN-BASELINE-2026-06-12`) as the known-exceptions
   baseline for WLES shift-event chain verification.
2. The 11 enumerated `spec_version 0` events (2026-04-30 to 2026-05-11) are
   recognised as historical artefacts of the pre-v1.0 hash-specification flux,
   not as evidence of tampering. The daily CHAIN_BREAK alert rows recorded
   since 2026-04-28 remain on the immutable record.
3. No event row, hash, or alert row is modified or deleted under this
   resolution. The raw `chain_integrity_shift_events` check remains unfiltered.
   The `chain_integrity_shift_events_ex_baseline` check is the operational
   signal.
4. Upon adoption, the SHA-256 of the baseline JSON file at the adopted commit
   shall be registered as a `substrate_anchors` row, bringing the exceptions
   list itself under `anchor_fingerprint` coverage.
5. The 2026-06-06 `EXPORT_RECORD` (`a7f7961a-8352-4c90-8efb-d843b6d2fe39`) is
   NOT baselined by this resolution. Disposition: ______________________
   (founder attribution of the 2026-06-06T04:53Z service-role test mint, or
   escalation as a security finding).

Signed (director): ______________________
