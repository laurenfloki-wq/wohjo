# Passkey "app-open" enforcement gap — held W2(2)

**Status:** HELD pending an architectural decision (Lauren, 2026-06-25).
Workstream 2 shipped (1) the first-run enrolment offer and (3) device
management / revocation. Bullet (2) — "passkey-first-then-SMS-fallback **on app
open**" — is held because the #194 backend does not support it as written.

## The finding (verified against source, not assumed)

1. **Passkey auth requires an existing Supabase session.** Both
   `POST /api/worker/passkey/auth-options` and `.../auth-verify` call
   `requireWorkerIdentity(log)`. A passkey assertion therefore runs _inside_ an
   already-established worker session; it cannot be the primary authenticator at
   app open (before any session exists).

2. **Nothing consumes an `APP_ACCESS` grant.** `auth-verify` mints a
   `worker_mfa_grants` row with `challenge_for = 'APP_ACCESS'`, but the only
   `assertActiveGrant(...)` call sites pass `DISPUTE_NEW` or `EXPORT_FULL`
   (`src/app/api/worker/disputes/*`, `.../records/export`). No middleware, no
   layout, and no route reads an `APP_ACCESS` grant. The grant the passkey mints
   currently gates nothing.

Net: a passkey today is a within-session re-verification that mints an unused
grant. "Biometric instead of SMS every time" at app open needs two things that
do not exist yet.

## What "passkey-first on app open" would require

- **A session-establishing path for passkeys.** WebAuthn supports discoverable
  (resident) credentials, so the authenticator can present a passkey before the
  server knows the worker. But `auth-verify` would then need to _mint a Supabase
  session_ (e.g. a server-minted token / `auth.admin` session) rather than
  assume one — and drop its `requireWorkerIdentity` precondition for the
  app-open ceremony. That is new auth surface, not UX wiring.
- **An app-open enforcement consumer.** Something (middleware or the field
  layout) must require a valid `APP_ACCESS` grant to enter the field app, so
  that a passkey assertion is actually _worth_ something at open time. Today the
  Supabase session alone is the gate.

Both are re-architecture beyond "worker-facing UX only," and the second risks
locking workers out if mis-scoped (hence the SMS floor must stay the bypass).

## Options for the enforcement decision

1. **Keep passkeys as within-session convenience (no app-open change).** Lowest
   risk. The passkey re-verifies inside a live session; we wire an actual
   `APP_ACCESS` consumer later if/when a per-session re-auth gate is wanted. The
   shipped enrolment + device-management UX is already useful for that future.
2. **Add a passkey→Supabase-session path + an app-open `APP_ACCESS` gate.**
   Delivers the literal "biometric at app open" experience. Needs: a session
   mint in `auth-verify`, removal of its `requireWorkerIdentity` precondition
   for the open-time ceremony, an enforcement consumer, and a careful SMS-floor
   bypass so a worker with no/again-broken passkey is never dead-ended.
3. **Defer entirely.** Passkeys stay default-off until the model is decided.

## What shipped in this PR (W2 (1) + (3))

- `GET /api/worker/passkey/credentials` (list) + `DELETE` (revoke; hard-DELETE,
  worker-scoped, allowed by the append-only guard which blocks only key-material
  UPDATE).
- `listWorkerCredentials` / `revokeCredential` in `worker-passkey.ts`.
- First-run enrolment offer wired into the post-SMS-login flow
  (`src/app/(field)/field/page.tsx` → `/field/passkey?firstrun=1`), once per
  device (localStorage), skippable, re-offerable, never mandatory, and flag-
  gated (the credentials endpoint 404s when off; any failure falls through to
  `/field/home`, so the SMS floor is never disrupted).
- `PasskeyManager` device list + revoke + "Skip for now" affordance.

All behind `WORKER_PASSKEY_ACCESS` (default-off). The SMS floor and the
no-self-perpetuation guarantee (enrolment requires an SMS-sourced grant,
`challenge_id IS NOT NULL`) are intact and unchanged.
