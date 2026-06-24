# Phase A — passkey app-access ceremony design (WORKER_PASSKEY_ACCESS)

Increment 1 (this PR) shipped the foundation: the `worker_webauthn_credentials`
table (RLS + append-only key trigger), the flag, the sign-count clone/replay
guard, and the credential repo. This doc specifies increment 2 — the WebAuthn
ceremony itself — so it is built correctly against the guardrails, not improvised.

Phase A is auth-only. It does not touch `shift_events`, `generateEventHash`, or
the WLES chain. Event signing is Phase B (`WORKER_EVENT_SIGNING`), gated on
Lauren's Section 8 calls; it is NOT built here and A must never become B.

## Non-negotiables this design preserves
- **Phone-OTP (SMS) is the permanent floor.** Registration is authorised ONLY by
  a fresh code-verify grant (`assertActiveGrant`/`worker_mfa_grants`). Every
  passkey screen exposes a visible "use SMS code instead" path. A worker with no
  biometric, a borrowed phone, or a reset device always falls back to the floor.
- **A passkey assertion issues the SAME `worker_mfa_grants` grant the floor
  issues** — same TTL policy (one place), same `device_binding`, same
  `worker-signin-anomaly` pass. No new session/grant type.
- **Append-only credentials.** Rotation = new row + `status='revoked'` on the old
  (the DB trigger blocks any key/credential_id mutation). No in-place swap.

## Dependencies (added in increment 2, when first imported)
- `@simplewebauthn/server` (route handlers), `@simplewebauthn/browser` (worker PWA).
  Not added in increment 1 to avoid an unused dependency.

## Challenge storage
WebAuthn needs the server-issued random challenge persisted between
options-generation and verification. Add `worker_webauthn_challenges`
(`worker_id`, `challenge`, `ceremony` in `('register','authenticate')`,
`expires_at` ~5 min, `consumed_at`) — single-use, worker-scoped, service-role
only, mirroring `worker_mfa_challenges`. Do NOT store the challenge in a cookie
(PWA + replay surface).

## rpID / origin
- `rpID` = the registrable domain (`flosmosis.com`); `origin` = the deployed
  origin. Drive both from env (`NEXT_PUBLIC_APP_URL` / a `WEBAUTHN_RP_ID`), never
  hard-code, so preview/staging verify against their own origin. Verification
  passes `expectedRPID` + `expectedOrigin`.

## Ceremony 1 — registration (enrol a passkey)
Routes: `POST /api/worker/passkey/register-options`, `POST .../register-verify`.
1. `requireWorkerIdentity`; **require an active code-verify grant** (the SMS
   floor authorises enrolment) — reuse `assertActiveGrant`. No grant -> 403,
   route the worker to the SMS path.
2. `generateRegistrationOptions({ rpID, userID: workerId, excludeCredentials:
   getActiveCredentials(...), authenticatorSelection: { residentKey:'preferred',
   userVerification:'required', authenticatorAttachment:'platform' } })`; persist
   the challenge.
3. On verify: `verifyRegistrationResponse({ expectedChallenge, expectedOrigin,
   expectedRPID })`; on success `insertCredential(...)`, bound to the worker's
   current `worker_device_fingerprints` row (the device they verified on). Label
   from the anomaly module's `deviceLabel`.

## Ceremony 2 — authentication (app access)
Routes: `POST /api/worker/passkey/auth-options`, `POST .../auth-verify`.
1. `generateAuthenticationOptions({ rpID, allowCredentials: getActiveCredentials,
   userVerification:'required' })`; persist the challenge.
2. On verify: resolve the asserting credential via `getActiveCredentialById`;
   `verifyAuthenticationResponse(...)`; **reject on `isSignCountRegression`**;
   `recordAssertion(rowId, newCounter)`.
3. **Issue the grant via the same path the code-verify route uses** — same
   `worker_mfa_grants` mint, same `device_binding`, then run the
   `worker-signin-anomaly` observer (NEW_DEVICE etc., log-only).

## Fallback (must always be reachable)
Every options/verify response and every PWA screen carries a `fallback: 'sms'`
affordance. If passkey verify fails for any reason (no credential, user-verify
declined, counter regression, dependency error), the worker is routed to the
existing phone-OTP path with no degraded standing.

## Tests + gate (increment 2)
- Unit: option generation (rpID/challenge present), sign-count regression
  rejection (done in increment 1), fallback-affordance presence.
- Integration (real PG): enrol -> authenticate -> grant issued; registration
  without an active grant -> 403.
- Repo-confinement: the four routes go through the `worker-passkey` seam, never
  the raw client (mirror `tests/repo-confinement/w14c-*`).
- A new bulletproof scenario: **"SMS fallback always reachable"** — passkey
  disabled / failing still yields a working sign-in.
- The six required gates + `count_broken_chain_links() = 0` stay green. Phase A
  touches no chain object, so drift gate + attestation are unaffected.

## Forward hook for Phase B (do not build now)
Phase B's "one active signing device per worker" reuses these credentials as the
signing key and adds an active-signing-device pointer; rotation requires SMS
step-up and deactivates the prior signing key. Phase B is held pending Section 8.
