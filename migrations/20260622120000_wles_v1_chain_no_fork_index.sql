-- WLES integrity, Theme A part 3: enforce v1 chain linearity at insert (WLES-3).
--
-- validate_shift_event_chain() early-returns for v1, and getV1ChainTail has a
-- documented fork race: two concurrent v1 inserts can both read the same tail,
-- both set previous_event_hash = tail, and both commit — forking the chain.
-- Integrity then rests entirely on the once-daily cron noticing.
--
-- A partial UNIQUE index makes the fork structurally impossible, race-free and
-- without an advisory lock: within a company, no two v1 events may share a
-- previous_event_hash. That guarantees (a) at most one child per event — a
-- strictly linear chain — and (b) at most one genesis (the single event whose
-- previous_event_hash is the ZERO_HASH). The losing side of a race now gets a
-- unique-violation error instead of silently corrupting the ledger.
--
-- Verified before apply: previous_event_hash column is populated for all live
-- v1 rows and matches wles_event->>'previous_event_hash' exactly; no existing
-- (company_id, previous_event_hash) duplicates, so the index builds clean.

CREATE UNIQUE INDEX IF NOT EXISTS wles_v1_chain_no_fork
  ON public.shift_events (company_id, previous_event_hash)
  WHERE spec_version = '1.0' AND wles_event IS NOT NULL;
