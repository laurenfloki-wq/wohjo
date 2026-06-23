# Bot 6 — Brand-voice guardian

- **What it does:** scores drafts for brand voice. Deterministic hard gate
  (emoji block, banned hype phrasing, Australian-English flags) plus an optional
  Haiku voice score that runs only when explicitly enabled (cost control).
- **Trigger:** inline.
- **Runtime:** in-process library.
- **Gate tier:** T0.
- **Model:** Haiku (optional; deterministic checks need no LLM).
- **Expected monthly cost:** ~0 AUD; only the opt-in Haiku scoring spends tokens
  (a few hundred tokens per scored draft).

Evals: `voice.eval.test.ts` — clean copy passes; emoji and hype phrasing are
hard fails; Americanised spelling is flagged.
