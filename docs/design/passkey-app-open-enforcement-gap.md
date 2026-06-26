# Passkey "app-open" enforcement gap — held W2(2)

**Status:** BUILT (flag-off), 2026-06-26 — Lauren greenlit "build what Joao
expected" after Joao hit SMS-only on a second sign-in. The mechanism is NOT the
custom-Supabase-JWT first sketched: verifying the chokepoint showed
`requireWorkerIdentity` needs only the auth.users uuid (all worker data uses the
service client scoped by worker*id), so we issue our own short-lived HMAC-signed
**worker-session cookie** the chokepoint accepts alongside the Supabase session
(worker-only — admin stays Supabase + TOTP). No Supabase-JWT forgery, no GoTrue
bypass, no email mutation, no DDL, fully CI-verifiable. Implementation:
`src/lib/auth/worker-session.ts`, the `requireWorkerIdentity` extension in
`src/lib/auth/session.ts`, `openAuthOptions`/`openAuthVerify` in the ceremony,
the `auth-options-open`/`auth-verify-open`/`logout` routes, and the
`PasskeyFirstSignIn` client on `/field`. Gated on `WORKER_PASSKEY_ACCESS` AND
`WORKER_SESSION_SECRET`; both must be set + the lockout matrix walked on a real
device before the flag flips. The prior Option-A within-session biometric (#196)
stays as the lower-friction path. \_Historical context below records what was
held and why.*

## Session-mint feasibility — VERIFIED 2026-06-25 (the real blocker)

A full app-open passkey login needs to **mint a Supabase session for the worker
server-side** after a passkey assertion. That primitive is not cleanly available:

- **No `createSession` in the installed admin API.** `@supabase/auth-js`
  (supabase-js 2.105.3) exposes only `createUser`, `deleteUser`, `generateLink`,
  `getUserById`, `updateUserById`, `listUsers`, `inviteUserByEmail`, `signOut`.
- **`generateLink` is email-only** (magiclink/recovery/invite/signup). Workers
  sign up via **Supabase native phone-OTP**, so their `auth.users.email` is
  null — magiclink cannot target them. So the one supported session-mint path
  does not reach the actual worker population.
- **`SUPABASE_JWT_SECRET` is not configured** (absent from env + the secrets
  inventory), so a custom-signed-JWT session is not available without first
  provisioning that secret.
- **No in-repo precedent** — the old `preview-login` route is gone.

The rest of the chain IS supported and was re-confirmed: discoverable lookup via
`worker_webauthn_credentials.credential_id` (UNIQUE), `worker_mfa_grants.
webauthn_challenge_id`, the `workers.user_id → auth.users` bridge, and the SSR
cookie-write path (`createServerClient.setAll` + `auth.setSession`). The open-
time challenge can be cookie-stored (no DDL). So Pieces 1, 3, 4 are tractable;
**only Piece 2 (the session mint) is blocked.**

### The three ways forward (for the week-after build)

1. **Custom JWT (universal, needs a security sign-off).** Add `SUPABASE_JWT_SECRET`
   to Vercel; sign a short-lived (~12h shift) HS256 access token (`sub` = worker
   `user_id`, `aud`/`role` = authenticated) and set the cookie. Works for all
   workers, DDL-free. Tradeoff: bypasses GoTrue — sessions are not in
   `auth.sessions`, not GoTrue-revocable, and carry no refresh token (worker
   re-auths at expiry). A real auth-posture change; Lauren signs off explicitly.
2. **GoTrue-native primitive (slower, cleanest).** Provision a proper session
   issuer for a `user_id` — a Supabase Edge Function / GoTrue admin path that
   returns a real `{access_token, refresh_token}` pair — or backfill confirmed
   auth emails so magiclink works. Yields real refresh + revocation. Routed to
   chat-Claude; likely past Monday.
3. **Hold (current decision).** Ship Option A for Mo; revisit with (1) or (2).

Whichever is chosen, the lockout-prevention test matrix (§ below / the W2(2)
build plan) must be fully green in CI **and** walked on a real device before
`WORKER_PASSKEY_ACCESS` is flipped. The SMS floor stays the permanent bypass
throughout.

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
