# Bot 16 — Demo scheduling

- **What it does:** offers free slots, books, reminds, prep brief. The booking
  guard never double-books and rejects zero-length slots. Calendar/Gmail are
  connector calls; the slot logic is pure.
- **Trigger:** request/webhook. **Runtime:** Edge Function.
- **Gate tier:** T1. **Model:** none.
- **Expected monthly cost:** 0 AUD.

Evals: `scheduling.eval.test.ts` — overlap detection, no double-book, first-N offers.
