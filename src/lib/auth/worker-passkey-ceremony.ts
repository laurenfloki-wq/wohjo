// Phase A increment 2 (WORKER_PASSKEY_ACCESS) — WebAuthn ceremony.
//
// The route handlers are thin; this module holds the ceremony logic against
// @simplewebauthn/server v13, single-use challenge storage, and the grant mint.
// Auth-only: it never touches shift_events, generateEventHash, or the WLES chain.
//
// Invariants (the floor is permanent):
//   - REGISTRATION is authorised only by an active code-verify grant (the SMS
//     floor). The route asserts that before calling registerVerify.
//   - AUTHENTICATION issues a worker_mfa_grants APP_ACCESS grant via the SAME
//     shared mint (mintAppAccessGrant) — same TTL (MFA_GRANT_TTL_MS), same
//     device_binding — that the SMS path uses for its grants.
//   - Challenges are SINGLE-USE: consumed on verify; expired ones rejected.
//   - sign-count regression (isSignCountRegression) rejects clones/replays.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createServiceClient } from '@/lib/supabase/server';
import { MFA_GRANT_TTL_MS } from '@/lib/auth/worker-mfa';
import {
  getActiveCredentials,
  getActiveCredentialById,
  insertCredential,
  recordAssertion,
  isSignCountRegression,
} from '@/lib/auth/worker-passkey';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RP_NAME = 'FLOSTRUCTION';

/** Registrable rpID + origin, derived from NEXT_PUBLIC_APP_URL (no new env var). */
export function rpConfig(): { rpID: string; origin: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is required for WebAuthn rpID/origin');
  const u = new URL(appUrl);
  return { rpID: u.hostname, origin: u.origin };
}

// ── Single-use challenge storage (worker_webauthn_challenges) ─────────────────

async function storeChallenge(
  workerId: string,
  ceremony: 'register' | 'authenticate',
  challenge: string,
): Promise<void> {
  const supabase = createServiceClient();
  // Invalidate any prior unconsumed challenge for this (worker, ceremony).
  await supabase
    .from('worker_webauthn_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('worker_id', workerId)
    .eq('ceremony', ceremony)
    .is('consumed_at', null);
  const { error } = await supabase.from('worker_webauthn_challenges').insert({
    worker_id: workerId,
    ceremony,
    challenge,
    expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`passkey.storeChallenge: ${error.message}`);
}

/** Atomically consume the active challenge; returns { id, challenge } or null. */
async function consumeChallenge(
  workerId: string,
  ceremony: 'register' | 'authenticate',
): Promise<{ id: string; challenge: string } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('worker_webauthn_challenges')
    .select('id, challenge, expires_at')
    .eq('worker_id', workerId)
    .eq('ceremony', ceremony)
    .is('consumed_at', null)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  // Optimistic single-use consume.
  const { data: won } = await supabase
    .from('worker_webauthn_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('consumed_at', null)
    .select('id');
  if (!won || won.length === 0) return null; // a concurrent verify won
  if (new Date(data.expires_at as string).getTime() <= Date.now()) return null; // expired
  return { id: data.id as string, challenge: data.challenge as string };
}

// ── Registration ceremony ─────────────────────────────────────────────────────

export async function registerOptions(workerId: string, workerName: string) {
  const { rpID } = rpConfig();
  const existing = await getActiveCredentials(workerId);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: workerName,
    userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(workerId)),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
  });
  await storeChallenge(workerId, 'register', options.challenge);
  return options;
}

export async function registerVerify(
  workerId: string,
  response: Parameters<typeof verifyRegistrationResponse>[0]['response'],
  bind: { deviceFingerprint?: string | null; deviceLabel?: string | null },
): Promise<{ verified: boolean }> {
  const consumed = await consumeChallenge(workerId, 'register');
  if (!consumed) return { verified: false };
  const { rpID, origin } = rpConfig();
  let result: VerifiedRegistrationResponse;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { verified: false };
  }
  if (!result.verified || !result.registrationInfo) return { verified: false };
  const { credential, aaguid } = result.registrationInfo;
  await insertCredential({
    workerId,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    signCount: credential.counter,
    aaguid: aaguid ?? null,
    transports: credential.transports ?? null,
    deviceLabel: bind.deviceLabel ?? null,
    deviceFingerprint: bind.deviceFingerprint ?? null,
  });
  return { verified: true };
}

// ── Authentication ceremony ───────────────────────────────────────────────────

export async function authOptions(workerId: string) {
  const { rpID } = rpConfig();
  const creds = await getActiveCredentials(workerId);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId })),
    userVerification: 'required',
  });
  await storeChallenge(workerId, 'authenticate', options.challenge);
  return options;
}

/**
 * Verify an assertion and, on success, mint an APP_ACCESS grant via the shared
 * mint. Returns { verified } — the route maps false to the SMS fallback.
 */
export async function authVerify(
  workerId: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]['response'],
  deviceBinding: string,
): Promise<{ verified: boolean }> {
  const consumed = await consumeChallenge(workerId, 'authenticate');
  if (!consumed) return { verified: false };

  const credential = await getActiveCredentialById(workerId, response.id);
  if (!credential) return { verified: false };

  const { rpID, origin } = rpConfig();
  let result: VerifiedAuthenticationResponse;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: consumed.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credential.credentialId,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.signCount,
      },
    });
  } catch {
    return { verified: false };
  }
  if (!result.verified) return { verified: false };

  const newCounter = result.authenticationInfo.newCounter;
  if (isSignCountRegression(credential.signCount, newCounter)) return { verified: false };
  await recordAssertion(credential.id, newCounter);
  // Provenance: the exact consumed challenge row is this assertion's source
  // (threaded through, not re-queried — concurrency-safe).
  await mintAppAccessGrant(workerId, consumed.id, deviceBinding);
  return { verified: true };
}

/**
 * Mint the APP_ACCESS worker_mfa_grants grant from a passkey assertion — same
 * TTL + device_binding the SMS path uses; sourced from this assertion's exact
 * (already-consumed) passkey challenge row.
 */
async function mintAppAccessGrant(
  workerId: string,
  webauthnChallengeId: string,
  deviceBinding: string,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('worker_mfa_grants').insert({
    worker_id: workerId,
    challenge_for: 'APP_ACCESS',
    webauthn_challenge_id: webauthnChallengeId,
    granted_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + MFA_GRANT_TTL_MS).toISOString(),
    device_binding: deviceBinding,
  });
  if (error) throw new Error(`passkey.mintAppAccessGrant: ${error.message}`);
}
