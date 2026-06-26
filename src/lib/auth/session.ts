// Day 5 P1 — auth helpers that derive company membership and worker
// identity from the session. Closes GAP-A3-001 (command) and GAP-A3-002
// (field) by replacing every client-supplied `company_id` / `worker_id`
// with a server-derived value.
//
// All helpers:
//   * Take a Logger for structured pino-WARN of every rejection path.
//   * Throw `AuthorizationError(status, code, message)` on failure; the
//     caller route catches and translates to NextResponse.
//   * Use the service-role Supabase client because the `admins` and
//     `workers` tables have RLS that only service_role can read
//     across arbitrary users.

import type { Logger } from 'pino';
import type { User } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { AuthorizationError } from './errors';
import { assertAdminMfaSatisfied } from './admin-mfa';
import { readWorkerSessionCookie, workerPasskeyLoginEnabled } from './worker-session';

// ---------------------------------------------------------------
// Session lookup helper
// ---------------------------------------------------------------

/**
 * Resolve the Supabase user from the request cookies. Throws
 * AuthorizationError(401) when no session is present.
 *
 * Exposed separately so tests can mock it or reuse without repeating
 * cookie plumbing.
 */
export async function getAuthenticatedUser(log: Logger): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    log.warn({ err: error?.message }, 'auth.session.missing');
    throw new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }
  return user;
}

// ---------------------------------------------------------------
// Admin / company membership
// ---------------------------------------------------------------

export interface CompanyMembership {
  userId: string;
  companyId: string;
  role: string;
}

/**
 * Look up the `admins` row for the authenticated user. Returns the
 * single (userId, companyId, role) triple.
 *
 * Throws:
 *   * 401 UNAUTHENTICATED when no Supabase session.
 *   * 403 NOT_A_COMPANY_ADMIN when authenticated but no admins row.
 *
 * Note on multi-company admins: the admins table PRIMARY KEY is
 * `(user_id, company_id)`, so a single user MAY legitimately
 * administer multiple companies. The Day 5 application assumes
 * one-company-per-admin and pulls the first row; if Lauren later
 * enables multi-company admins the route layer will need an explicit
 * company-selection mechanism (e.g. `X-Company-Id` request header).
 * For now this helper throws `AMBIGUOUS_MEMBERSHIP` if more than
 * one row exists, forcing us to revisit before any silent bug.
 */
export async function getCompanyIdForSession(
  log: Logger,
  opts: { skipMfaCheck?: boolean } = {},
): Promise<CompanyMembership> {
  const user = await getAuthenticatedUser(log);
  const service = createServiceClient();
  const { data, error } = await service
    .from('admins')
    .select('user_id, company_id, role')
    .eq('user_id', user.id);
  if (error) {
    log.error({ err: error.message, userId: user.id }, 'auth.admins.lookup_failed');
    throw new AuthorizationError(500, 'ADMINS_LOOKUP_FAILED', error.message);
  }
  if (!data || data.length === 0) {
    log.warn({ userId: user.id }, 'auth.admins.no_membership');
    throw new AuthorizationError(
      403,
      'NOT_A_COMPANY_ADMIN',
      'User is not a registered admin of any company.',
    );
  }
  if (data.length > 1) {
    log.warn(
      { userId: user.id, companyIds: data.map((r: { company_id: string }) => r.company_id) },
      'auth.admins.ambiguous_membership',
    );
    throw new AuthorizationError(
      400,
      'AMBIGUOUS_MEMBERSHIP',
      'User administers multiple companies; company-selection mechanism not yet implemented.',
    );
  }
  const row = data[0] as { user_id: string; company_id: string; role: string };
  // W6(b)/SG-7 -- graduated TOTP second factor. Admins with a confirmed
  // authenticator must hold an unexpired admin_mfa_grants row; admins
  // who have not enrolled pass with a warn-log (no founder lockout).
  // The MFA routes themselves call with skipMfaCheck to avoid a
  // bootstrap deadlock. See src/lib/auth/admin-mfa.ts.
  if (!opts.skipMfaCheck) {
    await assertAdminMfaSatisfied(log, row.user_id);
  }
  return { userId: row.user_id, companyId: row.company_id, role: row.role };
}

/**
 * Assert the authenticated admin belongs to `targetCompanyId`. Used by
 * the few routes that take a company_id from URL path or route params
 * (rather than reading it from session). Throws 403 FORBIDDEN_COMPANY
 * on mismatch.
 *
 * Most routes should prefer getCompanyIdForSession and use the derived
 * companyId directly. This helper exists for future cross-company
 * admin scenarios (none today).
 */
export async function requireCompanyMembership(
  log: Logger,
  targetCompanyId: string,
): Promise<CompanyMembership> {
  const membership = await getCompanyIdForSession(log);
  if (membership.companyId !== targetCompanyId) {
    log.warn(
      {
        userId: membership.userId,
        actualCompanyId: membership.companyId,
        targetCompanyId,
      },
      'auth.company_membership.mismatch',
    );
    throw new AuthorizationError(
      403,
      'FORBIDDEN_COMPANY',
      'Admin is not a member of the target company.',
    );
  }
  return membership;
}

// ---------------------------------------------------------------
// Worker identity — GAP-A3-002 closure
// ---------------------------------------------------------------

export interface WorkerIdentity {
  userId: string;
  workerId: string;
  companyId: string | null;
  phone: string;
}

/**
 * Derive the authenticated worker from the Supabase phone-OTP session.
 * Workers sign in via OTP; `auth.users.phone` (or `user.phone` field)
 * is the capability. We look up `workers.user_id = user.id`.
 *
 * Throws:
 *   * 401 UNAUTHENTICATED when no session.
 *   * 403 NOT_A_WORKER when authenticated but no workers row linked.
 */
export async function requireWorkerIdentity(log: Logger): Promise<WorkerIdentity> {
  const userId = await resolveWorkerUserId(log);
  const service = createServiceClient();
  const { data, error } = await service
    .from('workers')
    .select('id, company_id, phone')
    .eq('user_id', userId)
    // is_active is re-checked on EVERY request, so deactivating a worker
    // revokes a passkey worker-session within one request (no stale grant).
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    log.error({ err: error.message, userId }, 'auth.workers.lookup_failed');
    throw new AuthorizationError(500, 'WORKERS_LOOKUP_FAILED', error.message);
  }
  if (!data) {
    log.warn({ userId }, 'auth.workers.no_identity');
    throw new AuthorizationError(
      403,
      'NOT_A_WORKER',
      'Authenticated user has no active worker record on file.',
    );
  }
  const row = data as { id: string; company_id: string | null; phone: string };
  return {
    userId,
    workerId: row.id,
    companyId: row.company_id,
    phone: row.phone,
  };
}

/**
 * Resolve the worker's auth.users id from EITHER the Supabase phone-OTP session
 * (the permanent floor) OR — when app-open passkey login is live
 * (WORKER_PASSKEY_ACCESS on + WORKER_SESSION_SECRET set) — a valid self-issued
 * worker-session cookie minted by a verified passkey assertion. This second
 * path is WORKER-ONLY; admin auth (getCompanyIdForSession) never consults it.
 * The workers lookup above re-validates is_active, so the cookie alone never
 * outlives a deactivation.
 */
async function resolveWorkerUserId(log: Logger): Promise<string> {
  // Supabase session first.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user.id;
  } catch {
    // No/!invalid Supabase session — fall through to the passkey cookie.
  }
  // Passkey worker-session cookie (only if the feature is live).
  if (workerPasskeyLoginEnabled()) {
    const claims = await readWorkerSessionCookie(Date.now());
    if (claims) return claims.uid;
  }
  log.warn({}, 'auth.session.missing');
  throw new AuthorizationError(401, 'UNAUTHENTICATED', 'Authentication required.');
}

/**
 * Assert the authenticated worker owns the given `targetWorkerId`. Used
 * by routes that accept a worker_id in URL path or body for legacy
 * reasons; the preferred pattern is to remove client-supplied worker_id
 * entirely and use `requireWorkerIdentity().workerId`.
 */
export async function requireWorkerOwnership(
  log: Logger,
  targetWorkerId: string,
): Promise<WorkerIdentity> {
  const identity = await requireWorkerIdentity(log);
  if (identity.workerId !== targetWorkerId) {
    log.warn(
      {
        userId: identity.userId,
        actualWorkerId: identity.workerId,
        targetWorkerId,
      },
      'auth.worker_ownership.mismatch',
    );
    throw new AuthorizationError(
      403,
      'FORBIDDEN_WORKER',
      'Authenticated worker does not own the target record.',
    );
  }
  return identity;
}
