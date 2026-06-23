// L2.1 — Worker MFA helpers
//
// Three actions are MFA-gated for workers:
//   - DISPUTE_NEW   : POST /api/worker/disputes/new
//   - EXPORT_FULL   : GET /api/worker/records/export?format=all (or ?format=csv|json|pdf-receipts on full history)
//   - PHONE_CHANGE  : worker-initiated phone-number change
//
// This module contains:
//   - issueChallenge(workerId, action) — generates 6-digit code,
//     bcrypts it, persists row, returns { challengeId, expiresAt, code }.
//     The code is delivered via email by the route layer; the helper
//     itself doesn't send email so it stays unit-testable.
//   - verifyChallenge(challengeId, code) — atomically consumes the
//     challenge if the code matches and the challenge isn't expired
//     or out of attempts. On success, mints a 15-minute grant and
//     returns the grant record.
//   - assertActiveGrant(workerId, action) — throws AuthorizationError
//     if no unconsumed, unexpired grant exists. Called by the gated
//     route handlers BEFORE performing the action.
//
// Authoring contract:
//   - Codes are 6 digits, single-use, 5-minute TTL.
//   - Grants are 15-minute TTL after successful verification.
//   - Max 10 verify attempts per challenge before lockout.
//   - Rate limit: 5 issue requests per worker per hour (enforced by
//     the route layer using existing rate-limit primitive).
//   - Grants can be consumed multiple times within their TTL — they
//     act as a session-scoped capability, not a one-shot token.
//     This avoids "MFA after every form-validation error" UX trap.

import { createHash, randomBytes, scryptSync, timingSafeEqual, webcrypto } from 'node:crypto';
import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';
import { AuthorizationError } from './errors';

export type MfaAction = 'DISPUTE_NEW' | 'EXPORT_FULL' | 'PHONE_CHANGE';

export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MFA_GRANT_TTL_MS = 15 * 60 * 1000;
export const MFA_MAX_VERIFY_ATTEMPTS = 10;

/**
 * AUTH-5 — device fingerprint a grant is bound to. We have no per-device
 * cookie for workers (they sign in via phone-OTP), so the strongest stable
 * discriminator available on every request is the user-agent: a grant minted
 * in the worker's mobile app can't then be ridden from a different browser on
 * a hijacked session. A missing UA hashes to a stable sentinel so absent
 * matches only absent — it never silently disables the binding.
 */
export function deviceBindingFromUserAgent(userAgent: string | null | undefined): string {
  return createHash('sha256').update(userAgent ?? '').digest('hex');
}

export interface IssuedChallenge {
  challengeId: string;
  expiresAt: string; // ISO
  code: string;      // 6-digit; deliver via email immediately, then drop from memory
}

export interface MfaGrant {
  grantId: string;
  workerId: string;
  challengeFor: MfaAction;
  expiresAt: string; // ISO
}

function generateCode(): string {
  // crypto-quality randomness; 6 digits zero-padded
  const buf = new Uint32Array(1);
  webcrypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, '0');
}

// Scrypt parameters: N=16384 cost factor — slow enough that brute-
// forcing a 6-digit code (10^6 candidates) is not practical even
// without the per-challenge attempts cap. Salt + parameters embedded
// in the stored string so verification is self-describing.
const SCRYPT_KEYLEN = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function hashCode(code: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(code, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  // Format: scrypt$N$r$p$saltHex$derivedHex
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    Buffer.from(derived).toString('hex'),
  ].join('$');
}

function verifyCodeAgainstHash(code: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'hex');
  const expected = Buffer.from(parts[5], 'hex');
  if (!salt.length || !expected.length) return false;
  let derived: Buffer;
  try {
    derived = Buffer.from(scryptSync(code, salt, expected.length, { N, r, p }));
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Generate a fresh challenge for the (worker, action) pair. Invalidates
 * any prior unconsumed challenge for the same pair so a worker can't
 * accumulate stale codes.
 *
 * Returns the plaintext code in the response — the caller MUST email it
 * to the worker and then drop it. Do NOT log the code.
 */
export async function issueChallenge(
  log: Logger,
  workerId: string,
  action: MfaAction,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssuedChallenge> {
  const supabase = createServiceClient();

  // Invalidate any prior unconsumed challenge for the same pair.
  // Setting consumed_at = now() is the convention; the row is then
  // ignored by the partial index for "unconsumed".
  const { error: invalidateErr } = await supabase
    .from('worker_mfa_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('worker_id', workerId)
    .eq('challenge_for', action)
    .is('consumed_at', null);
  if (invalidateErr) {
    log.error({ err: invalidateErr.message, workerId, action }, 'mfa.invalidate_prior.failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not prepare a new MFA challenge.');
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + MFA_CHALLENGE_TTL_MS);

  const { data, error: insertErr } = await supabase
    .from('worker_mfa_challenges')
    .insert({
      worker_id: workerId,
      challenge_for: action,
      code_hash: codeHash,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      ip_address: context.ip ?? null,
      user_agent: context.userAgent ?? null,
    })
    .select('id, expires_at')
    .single();
  if (insertErr || !data) {
    log.error(
      { err: insertErr?.message, workerId, action },
      'mfa.issue.insert_failed',
    );
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not issue an MFA challenge.');
  }

  log.info(
    { workerId, action, challengeId: data.id, expiresAt: data.expires_at },
    'mfa.issue.ok',
  );

  return {
    challengeId: data.id as string,
    expiresAt: data.expires_at as string,
    code,
  };
}

/**
 * Verify a code against a challenge. On success, marks the challenge
 * consumed and mints a 15-minute grant. Throws AuthorizationError on
 * any failure path (404 unknown challenge, 410 expired/exhausted,
 * 401 wrong code).
 *
 * Increments the attempts counter on every wrong-code attempt; locks
 * the challenge after MFA_MAX_VERIFY_ATTEMPTS by marking it consumed.
 */
export async function verifyChallenge(
  log: Logger,
  workerId: string,
  challengeId: string,
  code: string,
  deviceBinding?: string | null,
): Promise<MfaGrant> {
  const supabase = createServiceClient();

  const { data: challenge, error: fetchErr } = await supabase
    .from('worker_mfa_challenges')
    .select('id, worker_id, challenge_for, code_hash, expires_at, consumed_at, attempts')
    .eq('id', challengeId)
    .maybeSingle();
  if (fetchErr) {
    log.error({ err: fetchErr.message, challengeId }, 'mfa.verify.fetch_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not look up MFA challenge.');
  }
  if (!challenge) {
    log.warn({ challengeId, workerId }, 'mfa.verify.unknown_challenge');
    throw new AuthorizationError(404, 'MFA_UNKNOWN_CHALLENGE', 'No such MFA challenge.');
  }

  // Worker scoping — caller is the authenticated worker; mismatch is
  // a forensic-grade event.
  if (challenge.worker_id !== workerId) {
    log.warn(
      { challengeId, workerId, challengeWorkerId: challenge.worker_id },
      'mfa.verify.worker_mismatch',
    );
    throw new AuthorizationError(403, 'MFA_FORBIDDEN', 'MFA challenge does not belong to caller.');
  }

  if (challenge.consumed_at) {
    log.warn({ challengeId, workerId }, 'mfa.verify.already_consumed');
    throw new AuthorizationError(410, 'MFA_CONSUMED', 'MFA challenge already used.');
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    log.warn({ challengeId, workerId }, 'mfa.verify.expired');
    // Mark consumed so it cannot be used after a clock skew.
    await supabase
      .from('worker_mfa_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challengeId);
    throw new AuthorizationError(410, 'MFA_EXPIRED', 'MFA challenge expired. Request a new code.');
  }

  if (challenge.attempts >= MFA_MAX_VERIFY_ATTEMPTS) {
    log.warn({ challengeId, workerId, attempts: challenge.attempts }, 'mfa.verify.attempts_exceeded');
    await supabase
      .from('worker_mfa_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challengeId);
    throw new AuthorizationError(429, 'MFA_LOCKED', 'Too many wrong codes. Request a new one.');
  }

  const ok = verifyCodeAgainstHash(code, challenge.code_hash);
  if (!ok) {
    await supabase
      .from('worker_mfa_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('id', challengeId);
    log.warn(
      { challengeId, workerId, attempts: challenge.attempts + 1 },
      'mfa.verify.wrong_code',
    );
    throw new AuthorizationError(401, 'MFA_WRONG_CODE', 'That code does not match.');
  }

  // Atomic consume-and-mint. Two updates rather than one transaction
  // because the Supabase JS client doesn't expose explicit transactions
  // server-side; the worst case is a momentary "consumed but no grant"
  // window which the worker resolves by requesting a new code.
  const consumedAt = new Date().toISOString();
  const { error: consumeErr } = await supabase
    .from('worker_mfa_challenges')
    .update({ consumed_at: consumedAt })
    .eq('id', challengeId)
    .is('consumed_at', null); // optimistic concurrency: only consume if still unconsumed
  if (consumeErr) {
    log.error({ err: consumeErr.message, challengeId }, 'mfa.verify.consume_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not consume the MFA challenge.');
  }

  const grantedAt = new Date();
  const grantExpiresAt = new Date(grantedAt.getTime() + MFA_GRANT_TTL_MS);
  const { data: grant, error: grantErr } = await supabase
    .from('worker_mfa_grants')
    .insert({
      worker_id: workerId,
      challenge_for: challenge.challenge_for,
      challenge_id: challengeId,
      granted_at: grantedAt.toISOString(),
      expires_at: grantExpiresAt.toISOString(),
      // AUTH-5 — pin the grant to the verifying device. NULL when the caller
      // doesn't supply one (e.g. legacy callers) so the grant stays unbound.
      device_binding: deviceBinding ?? null,
    })
    .select('id, expires_at')
    .single();
  if (grantErr || !grant) {
    log.error({ err: grantErr?.message, challengeId, workerId }, 'mfa.verify.grant_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not mint MFA grant.');
  }

  log.info(
    { workerId, action: challenge.challenge_for, grantId: grant.id, expiresAt: grant.expires_at },
    'mfa.verify.ok',
  );

  return {
    grantId: grant.id as string,
    workerId,
    challengeFor: challenge.challenge_for as MfaAction,
    expiresAt: grant.expires_at as string,
  };
}

/**
 * Throws AuthorizationError(403, 'MFA_REQUIRED', ...) if the worker
 * does not currently hold an unexpired, unconsumed grant for the
 * given action. Called by the gated route handlers FIRST.
 *
 * Grants are NOT consumed by reads — see module-level note. Grants
 * are explicitly consumed by callers that want one-shot semantics
 * (rare; the dispute and export routes don't).
 */
export async function assertActiveGrant(
  log: Logger,
  workerId: string,
  action: MfaAction,
  deviceBinding?: string | null,
): Promise<MfaGrant> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  // Pull the candidate active grants (most-recent first). We filter the
  // device binding in code rather than SQL so a binding mismatch is logged
  // as a forensic event and legacy NULL-binding grants can be grandfathered.
  const { data, error } = await supabase
    .from('worker_mfa_grants')
    .select('id, worker_id, challenge_for, expires_at, device_binding')
    .eq('worker_id', workerId)
    .eq('challenge_for', action)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: false })
    .limit(10);
  if (error) {
    log.error({ err: error.message, workerId, action }, 'mfa.assert.lookup_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not check MFA grant.');
  }
  const candidates = (data ?? []) as Array<{
    id: string;
    worker_id: string;
    challenge_for: string;
    expires_at: string;
    device_binding: string | null;
  }>;

  // AUTH-5 — when the caller supplies the current device binding, a bound
  // grant is honoured only from the device that earned it. NULL-binding
  // grants are grandfathered (minted before AUTH-5; expire within 15 min).
  // A bound grant whose binding doesn't match is a cross-device replay —
  // skip it and keep looking, but record it.
  let sawBindingMismatch = false;
  const match = candidates.find((g) => {
    if (deviceBinding == null) return true; // caller opted out of binding
    if (g.device_binding == null) return true; // legacy/unbound grant
    if (g.device_binding === deviceBinding) return true;
    sawBindingMismatch = true;
    return false;
  });

  if (!match) {
    if (sawBindingMismatch) {
      log.warn({ workerId, action }, 'mfa.assert.device_binding_mismatch');
    } else {
      log.info({ workerId, action }, 'mfa.assert.no_active_grant');
    }
    throw new AuthorizationError(
      403,
      'MFA_REQUIRED',
      'Verify your identity to continue. Request a code, then try again.',
    );
  }
  return {
    grantId: match.id,
    workerId: match.worker_id,
    challengeFor: match.challenge_for as MfaAction,
    expiresAt: match.expires_at,
  };
}
