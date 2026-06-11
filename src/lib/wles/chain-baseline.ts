// Spine ruling 2026-06-12 -- WLES chain-integrity known-exceptions baseline.
//
// The 11 ids below are spec_version 0 events written 2026-04-30..05-11
// while the hash spec was in flux (pre-v1.0 cutover). Their mismatch is
// a documented historical artefact; the evidentiary instrument is
// docs/evidence/chain-integrity-baseline-2026-06-12.json, adopted by
// directors' resolution and anchored after signature.
//
// CONTRACT (pinned by tests/substrate/chain-baseline.test.ts):
//   * The raw chain_integrity_shift_events check is NEVER filtered.
//   * Only chain_integrity_shift_events_ex_baseline excludes these ids.
//   * The 2026-06-06 EXPORT_RECORD (a7f7961a...) was attributed on
//     2026-06-12 to the PR #44 bulletproof-harness session's prod-side
//     planted-break fixture (class SYNTHETIC_TEST_FIXTURE in the JSON;
//     full evidence chain recorded there) and is now baselined.
//   * This list only grows by a new signed baseline revision. Removing
//     an id is fine (an event cannot un-mismatch honestly); adding one
//     requires the evidentiary process, not a quick edit.

export const CHAIN_BASELINE_ID = 'WLES-CHAIN-BASELINE-2026-06-12';

export const CHAIN_BASELINE_EVENT_IDS: ReadonlySet<string> = new Set([
  '6d5797b3-4f88-4d16-bc97-b9a7b5ea5b5b', // START_EVENT 2026-04-30
  '94604767-7545-4918-b440-c898a3608114', // START_EVENT 2026-05-04
  '37d3364d-5d45-441f-896f-2a396fb50760', // SUPERVISOR_APPROVAL 2026-05-05
  '27c6e993-ea01-420a-84a7-8c23b1416359', // SUPERVISOR_APPROVAL 2026-05-05
  'ff1f6469-20eb-4e41-bbce-caaacb2387e6', // START_EVENT 2026-05-06
  '3978ad0f-7481-49b2-aefb-05ebc8b35443', // SUPERVISOR_APPROVAL 2026-05-06
  'e458dc61-040b-453d-9f98-7d92436e6fbe', // SUPERVISOR_APPROVAL 2026-05-06
  'a3855372-bbe5-40db-b3dd-b79294481a0b', // SUPERVISOR_APPROVAL 2026-05-06
  '8ee7eff6-690b-4547-827e-d1330f481bdb', // SUPERVISOR_APPROVAL 2026-05-06
  'c7202f91-0811-4014-85c8-2314195714b1', // START_EVENT 2026-05-08
  '6e57e0c4-ea6b-4082-be40-a6407a956348', // START_EVENT 2026-05-11
  'a7f7961a-8352-4c90-8efb-d843b6d2fe39', // EXPORT_RECORD 2026-06-06 -- SYNTHETIC_TEST_FIXTURE (PR #44 planted break, attributed 2026-06-12)
]);
