# Bot 8 — Newsletter

- **What it does:** monthly, assembles and drafts the newsletter. The send is
  structurally blocked unless the email carries the FLOSMOSIS ABN and a
  functional unsubscribe, and is emoji-free (Spam Act 2003). assembleNewsletter
  runs that guard, so a non-compliant newsletter cannot reach the T2 send gate.
- **Trigger:** monthly. **Runtime:** pg_cron -> Edge Function.
- **Gate tier:** T2 send. **Model:** Sonnet (draft).
- **Expected monthly cost:** low.

Evals: `newsletter.eval.test.ts` — compliant assembly; blocks emoji; blocks missing unsubscribe.
