// W6(b)/SG-7 -- Admin TOTP MFA policy layer.
//
// Admins authenticate with a Supabase session; this module adds the
// optional TOTP second factor on top:
//
//   startEnrolment   -> mint an UNCONFIRMED secret (otpauth URI for the
//                       authenticator app). Re-running before confirm
//                       rotates the secret; refused once confirmed.
//   confirmEnrolment -> first valid code proves possession; sets
//                       confirmed_at and mints a grant.
//   verifyAdminMfa   -> code -> 12-hour admin_mfa_grants row.
//   assertAdminMfaSatisfied -> called by getCompanyIdForSession on
//                       every command request.
//
// GRADUATED ENFORCEMENT (recorded decision, PR body):
//   * No confirmed secret  -> allow + warn 'admin.mfa.not_enrolled'.
//     This prevents founder lockout before enrolment; the warn stream
//     is the nag. Hard-require for all admins = founder flip later.
//   * Confirmed secret     -> an unexpired grant is REQUIRED; absence
//     throws 403 MFA_REQUIRED (same code the worker machinery uses).
//   * Infra error on lookup -> allow + error log (fail-open). Failing
//     closed here would brick the whole command surface on a transient
//     DB error; the error log + substrate health are the alarm path.
//
// Service-role access follows the session.ts/worker-mfa.ts lib-layer
// convention (createServiceClient); RLS on both tables is
// service-role-only so secrets are unreachable via PostgREST.

import type { Logger } from 'pino';
import { createServiceClient } from '@/lib/supabase/server';
import { AuthorizationError } from './errors';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

export const ADMIN_MFA_GRANT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface AdminMfaStatus {
  enrolled: boolean; // confirmed secret on file
  pending: boolean; // secret minted but not yet confirmed
  grantActive: boolean;
  grantExpiresAt: string | null;
}

interface TotpRow {
  user_id: string;
  secret_base32: string;
  confirmed_at: string | null;
  last_used_step: number;
}

async function fetchTotpRow(log: Logger, userId: string): Promise<TotpRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_mfa_totp')
    .select('user_id, secret_base32, confirmed_at, last_used_step')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    log.error({ err: error.message, userId }, 'admin.mfa.lookup_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not look up MFA enrolment.');
  }
  return (data as TotpRow | null) ?? null;
}

async function activeGrantExpiry(log: Logger, userId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_mfa_grants')
    .select('id, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    log.error({ err: error.message, userId }, 'admin.mfa.grant_lookup_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not check MFA grant.');
  }
  return data ? (data.expires_at as string) : null;
}

async function mintGrant(
  log: Logger,
  userId: string,
  context: { userAgent?: string | null } = {},
): Promise<string> {
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + ADMIN_MFA_GRANT_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from('admin_mfa_grants')
    .insert({
      user_id: userId,
      expires_at: expiresAt,
      user_agent: context.userAgent ?? null,
    })
    .select('id, expires_at')
    .single();
  if (error || !data) {
    log.error({ err: error?.message, userId }, 'admin.mfa.grant_insert_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not record MFA verification.');
  }
  log.info({ userId, grantId: data.id, expiresAt: data.expires_at }, 'admin.mfa.grant_minted');
  return data.expires_at as string;
}

export async function getAdminMfaStatus(log: Logger, userId: string): Promise<AdminMfaStatus> {
  const row = await fetchTotpRow(log, userId);
  if (!row) return { enrolled: false, pending: false, grantActive: false, grantExpiresAt: null };
  if (!row.confirmed_at)
    return { enrolled: false, pending: true, grantActive: false, grantExpiresAt: null };
  const grantExpiresAt = await activeGrantExpiry(log, userId);
  return { enrolled: true, pending: false, grantActive: grantExpiresAt !== null, grantExpiresAt };
}

/**
 * Mint (or rotate) an UNCONFIRMED TOTP secret. Refused once confirmed --
 * resetting a confirmed factor is a founder/console concern, not an API
 * the session can reach.
 */
export async function startEnrolment(
  log: Logger,
  userId: string,
  accountLabel: string,
): Promise<{ secretBase32: string; otpauthUri: string }> {
  const existing = await fetchTotpRow(log, userId);
  if (existing?.confirmed_at) {
    log.warn({ userId }, 'admin.mfa.enrol.already_confirmed');
    throw new AuthorizationError(
      409,
      'MFA_ALREADY_ENROLLED',
      'TOTP is already enrolled for this admin.',
    );
  }
  const secret = generateTotpSecret();
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('admin_mfa_totp')
    .upsert(
      { user_id: userId, secret_base32: secret, confirmed_at: null, last_used_step: 0 },
      { onConflict: 'user_id' },
    );
  if (error) {
    log.error({ err: error.message, userId }, 'admin.mfa.enrol.upsert_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not start MFA enrolment.');
  }
  log.info({ userId }, 'admin.mfa.enrol.secret_minted');
  return { secretBase32: secret, otpauthUri: otpauthUri(secret, accountLabel) };
}

/** Atomically bump last_used_step (replay guard). Returns false if a concurrent verify won. */
async function consumeStep(
  log: Logger,
  userId: string,
  fromStep: number,
  toStep: number,
  extra: Record<string, string> = {},
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('admin_mfa_totp')
    .update({ last_used_step: toStep, ...extra })
    .eq('user_id', userId)
    .eq('last_used_step', fromStep)
    .select('user_id');
  if (error) {
    log.error({ err: error.message, userId }, 'admin.mfa.step_update_failed');
    throw new AuthorizationError(500, 'MFA_INTERNAL', 'Could not record MFA verification.');
  }
  return Array.isArray(data) && data.length > 0;
}

export async function confirmEnrolment(
  log: Logger,
  userId: string,
  code: string,
  context: { userAgent?: string | null } = {},
): Promise<{ grantExpiresAt: string }> {
  const row = await fetchTotpRow(log, userId);
  if (!row) {
    throw new AuthorizationError(404, 'MFA_NOT_ENROLLED', 'Start enrolment first.');
  }
  if (row.confirmed_at) {
    throw new AuthorizationError(
      409,
      'MFA_ALREADY_ENROLLED',
      'TOTP is already enrolled for this admin.',
    );
  }
  const result = verifyTotp(row.secret_base32, code, { lastUsedStep: Number(row.last_used_step) });
  if (!result.ok || result.step === undefined) {
    log.warn({ userId }, 'admin.mfa.confirm.bad_code');
    throw new AuthorizationError(
      401,
      'MFA_BAD_CODE',
      'That code is not valid. Check your authenticator app.',
    );
  }
  const won = await consumeStep(log, userId, Number(row.last_used_step), result.step, {
    confirmed_at: new Date().toISOString(),
  });
  if (!won) {
    log.warn({ userId }, 'admin.mfa.confirm.replay_race');
    throw new AuthorizationError(409, 'MFA_REPLAY', 'Code already used. Wait for the next one.');
  }
  log.info({ userId }, 'admin.mfa.confirm.ok');
  const grantExpiresAt = await mintGrant(log, userId, context);
  return { grantExpiresAt };
}

export async function verifyAdminMfa(
  log: Logger,
  userId: string,
  code: string,
  context: { userAgent?: string | null } = {},
): Promise<{ grantExpiresAt: string }> {
  const row = await fetchTotpRow(log, userId);
  if (!row || !row.confirmed_at) {
    throw new AuthorizationError(404, 'MFA_NOT_ENROLLED', 'TOTP is not enrolled for this admin.');
  }
  const result = verifyTotp(row.secret_base32, code, { lastUsedStep: Number(row.last_used_step) });
  if (!result.ok || result.step === undefined) {
    log.warn({ userId }, 'admin.mfa.verify.bad_code');
    throw new AuthorizationError(
      401,
      'MFA_BAD_CODE',
      'That code is not valid. Check your authenticator app.',
    );
  }
  const won = await consumeStep(log, userId, Number(row.last_used_step), result.step);
  if (!won) {
    log.warn({ userId }, 'admin.mfa.verify.replay_race');
    throw new AuthorizationError(409, 'MFA_REPLAY', 'Code already used. Wait for the next one.');
  }
  log.info({ userId }, 'admin.mfa.verify.ok');
  const grantExpiresAt = await mintGrant(log, userId, context);
  return { grantExpiresAt };
}

/** AUTH-3 — hard-require admin MFA. Default OFF (graduated: un-enrolled admins
 *  are allowed + nagged, infra errors fail open) so flipping it on can't lock
 *  out an admin before they enrol. Set ADMIN_MFA_REQUIRED='true' once every
 *  payroll-admin/operator has confirmed a factor: then un-enrolled admins are
 *  DENIED and an unverifiable lookup fails CLOSED. */
export function adminMfaHardRequired(): boolean {
  return process.env.ADMIN_MFA_REQUIRED === 'true';
}

/**
 * The chokepoint check -- called by getCompanyIdForSession for every
 * command request (unless skipMfaCheck, used only by the MFA routes
 * themselves to avoid a bootstrap deadlock).
 *
 * Graduated by default; hard-require + fail-closed when ADMIN_MFA_REQUIRED.
 */
export async function assertAdminMfaSatisfied(log: Logger, userId: string): Promise<void> {
  const hardRequire = adminMfaHardRequired();

  let row: TotpRow | null;
  try {
    row = await fetchTotpRow(log, userId);
  } catch {
    // fetchTotpRow already error-logged. Graduated: fail OPEN so a transient DB
    // error can't brick the command surface. Hard-require: fail CLOSED — a
    // money-moving role must not proceed on an unverifiable second factor.
    if (hardRequire) {
      throw new AuthorizationError(503, 'MFA_INTERNAL', 'Could not verify MFA. Please retry.');
    }
    return;
  }
  if (!row || !row.confirmed_at) {
    log.warn({ userId }, 'admin.mfa.not_enrolled');
    if (hardRequire) {
      throw new AuthorizationError(
        403,
        'MFA_ENROLMENT_REQUIRED',
        'Set up your authenticator (MFA) in Security settings to continue.',
      );
    }
    return; // graduated: allow until the admin confirms a factor
  }
  let grantExpiresAt: string | null;
  try {
    grantExpiresAt = await activeGrantExpiry(log, userId);
  } catch {
    if (hardRequire) {
      throw new AuthorizationError(503, 'MFA_INTERNAL', 'Could not verify MFA. Please retry.');
    }
    return; // fail-open, error already logged
  }
  if (!grantExpiresAt) {
    log.warn({ userId }, 'admin.mfa.grant_missing');
    throw new AuthorizationError(403, 'MFA_REQUIRED', 'Enter your authenticator code to continue.');
  }
}
