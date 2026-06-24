// Phase A (WORKER_PASSKEY_ACCESS) — passkey app-access for workers.
//
// A platform-authenticator (Face ID / fingerprint / device PIN) replaces the
// per-session phone-OTP prompt AFTER a worker has verified on a device. It is a
// convenience layer over auth ONLY; it never touches shift_events or the WLES
// chain (that is Phase B, WORKER_EVENT_SIGNING, a separate flag).
//
// FLOOR (non-negotiable): the Supabase phone-OTP (SMS) sign-in stays the
// permanent floor — first enrolment, device rotation, and recovery all run on
// it. A passkey is NEVER the only way in. Registration is authorised only by a
// fresh code-verify grant (the floor), and every passkey screen exposes a
// visible "use SMS code instead" fallback.
//
// This module holds the flag + the pure, runtime-free logic (sign-count
// regression) + the credential repository. The WebAuthn ceremony itself
// (@simplewebauthn option generation + response verification + challenge
// storage) lives in worker-passkey-ceremony.ts (increment 2) so this module
// stays unit-testable without the WebAuthn dependency.

import { createServiceClient } from '@/lib/supabase/server';

/** Phase A flag. Off by default; flipped on per-environment once gate-green. */
export function workerPasskeyAccessEnabled(): boolean {
  return process.env.WORKER_PASSKEY_ACCESS === 'true';
}

export interface WorkerWebAuthnCredential {
  id: string;
  workerId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  status: 'active' | 'revoked';
  deviceLabel: string | null;
  deviceFingerprint: string | null;
}

/**
 * WebAuthn signature-counter clone/replay check. The authenticator reports a
 * monotonic counter; a value that does not strictly increase past a non-zero
 * stored counter indicates a cloned authenticator or a replayed assertion and
 * MUST be rejected. Counter 0 is a documented "authenticator does not implement
 * a counter" case (common on platform authenticators) — when the stored counter
 * is 0 we cannot use it for clone detection, so 0/0 is allowed.
 */
export function isSignCountRegression(storedCount: number, assertedCount: number): boolean {
  if (storedCount === 0 && assertedCount === 0) return false; // counterless authenticator
  return assertedCount <= storedCount;
}

// ── Credential repository (service-role; the ceremony routes call these) ──────

/** Active credentials for a worker (the authentication allow-list + devices UI). */
export async function getActiveCredentials(workerId: string): Promise<WorkerWebAuthnCredential[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('worker_webauthn_credentials')
    .select(
      'id, worker_id, credential_id, public_key, sign_count, status, device_label, device_fingerprint',
    )
    .eq('worker_id', workerId)
    .eq('status', 'active');
  if (error) throw new Error(`worker_webauthn.getActiveCredentials: ${error.message}`);
  return (data ?? []).map(mapRow);
}

/** Look up a single active credential by its WebAuthn credential id. */
export async function getActiveCredentialById(
  workerId: string,
  credentialId: string,
): Promise<WorkerWebAuthnCredential | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('worker_webauthn_credentials')
    .select(
      'id, worker_id, credential_id, public_key, sign_count, status, device_label, device_fingerprint',
    )
    .eq('worker_id', workerId)
    .eq('credential_id', credentialId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(`worker_webauthn.getActiveCredentialById: ${error.message}`);
  return data ? mapRow(data) : null;
}

/** Persist a newly-registered credential. Append-only: the row's key material is immutable. */
export async function insertCredential(input: {
  workerId: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
  aaguid?: string | null;
  transports?: string[] | null;
  deviceLabel?: string | null;
  deviceFingerprint?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from('worker_webauthn_credentials').insert({
    worker_id: input.workerId,
    credential_id: input.credentialId,
    public_key: input.publicKey,
    sign_count: input.signCount,
    aaguid: input.aaguid ?? null,
    transports: input.transports ?? null,
    device_label: input.deviceLabel ?? null,
    device_fingerprint: input.deviceFingerprint ?? null,
    status: 'active',
  });
  if (error) throw new Error(`worker_webauthn.insertCredential: ${error.message}`);
}

/**
 * True if the worker currently holds an active (unconsumed, unexpired)
 * SMS-SOURCED grant — i.e. one minted by a code-verify (challenge_id IS NOT
 * NULL), NOT one minted by a passkey assertion (those carry webauthn_challenge_id
 * and challenge_id IS NULL). Registration of a new passkey is authorised ONLY by
 * an SMS-sourced grant, so a passkey session can never self-perpetuate enrolment
 * of more passkeys — enrolment always returns to the SMS floor.
 */
export async function hasActiveCodeVerifyGrant(workerId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('worker_mfa_grants')
    .select('id')
    .eq('worker_id', workerId)
    .not('challenge_id', 'is', null) // SMS-sourced only (excludes passkey APP_ACCESS grants)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`worker_webauthn.hasActiveCodeVerifyGrant: ${error.message}`);
  return data != null;
}

/** After a verified assertion: advance the sign counter + stamp last_used_at. */
export async function recordAssertion(
  credentialRowId: string,
  newSignCount: number,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('worker_webauthn_credentials')
    .update({ sign_count: newSignCount, last_used_at: new Date().toISOString() })
    .eq('id', credentialRowId);
  if (error) throw new Error(`worker_webauthn.recordAssertion: ${error.message}`);
}

function mapRow(r: Record<string, unknown>): WorkerWebAuthnCredential {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    credentialId: r.credential_id as string,
    publicKey: r.public_key as string,
    signCount: Number(r.sign_count ?? 0),
    status: (r.status as 'active' | 'revoked') ?? 'active',
    deviceLabel: (r.device_label as string | null) ?? null,
    deviceFingerprint: (r.device_fingerprint as string | null) ?? null,
  };
}
