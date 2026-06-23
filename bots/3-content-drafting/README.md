# Bot 3 — Content drafting

- **What it does:** drafts LinkedIn + Instagram copy from a brief and the brand
  voice rules. Every draft must pass the deterministic brand-voice validation
  (no emoji, no banned hype) before it reaches the T2 publish gate.
- **Trigger:** manual/calendar. **Runtime:** Edge Function (HTTP).
- **Gate tier:** T2 publish. **Model:** Sonnet.
- **Expected monthly cost:** low; a couple of Sonnet drafts per post.

Evals: `drafting.eval.test.ts` — clean passes; emoji and hype hard-fail.
