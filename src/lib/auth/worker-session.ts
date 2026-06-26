// Worker app-session — self-issued, HMAC-signed session for passkey app-open
// login (W2 bullet 2). Phase A (WORKER_PASSKEY_ACCESS).
//
// WHY a self-issued session and not a Supabase session: the worker identity
// chokepoint (requireWorkerIdentity) only needs the auth.users uuid — every
// worker data path then uses the SERVICE client scoped by worker_id (the
// workers table RLS is service-role-only; see src/lib/auth/session.ts). So a
// passkey-authenticated worker does not need a Supabase session to use the app;
// it needs the chokepoint to resolve a user_id. supabase-js 2.105 has no admin
// createSession, and generateLink is email-only (workers are phone-OTP signups
// with no auth email), so there is no clean Supabase-native mint. We therefore
// issue our own short-lived signed cookie carrying { uid, wid } that the
// chokepoint accepts ALONGSIDE the Supabase session — never instead of it for
// admins (admin auth stays Supabase + TOTP only).
//
// Security properties:
//   - HMAC-SHA256 over the payload with WORKER_SESSION_SECRET (timing-safe
//     compare); a tampered or unsigned token is rejected.
//   - Short TTL (12h shift window); expiry is re-checked on every request.
//   - Bound to a worker_id; requireWorkerIdentity re-reads workers.is_active on
//     every call, so deactivating a worker revokes access within one request.
//   - HttpOnly + Secure + SameSite=Lax cookie; never readable by JS.
//   - The whole feature is inert unless WORKER_PASSKEY_ACCESS is on AND
//     WORKER_SESSION_SECRET is set — absent either, it is as if it never shipped
//     and the SMS floor is the only path.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { workerPasskeyAccessEnabled } from '@/lib/auth/worker-passkey';

export const WORKER_SESSION_COOKIE = 'flos_ws';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h — a shift window

export interface WorkerSessionClaims {
  uid: string; // auth.users id
  wid: string; // workers.id
  exp: number; // unix ms
}

function secret(): string | null {
  const s = process.env.WORKER_SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** App-open passkey login is live only when the flag is on AND the signing
 *  secret is configured. Either missing → feature is inert (SMS floor only). */
export function workerPasskeyLoginEnabled(): boolean {
  return workerPasskeyAccessEnabled() && secret() !== null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlJson(obj: unknown): string {
  return b64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}

/** Sign `{uid, wid}` into a `<payload>.<mac>` token. Throws if no secret. */
export function signWorkerSession(input: { uid: string; wid: string }, nowMs: number): string {
  const key = secret();
  if (!key) throw new Error('worker-session: WORKER_SESSION_SECRET not configured');
  const claims: WorkerSessionClaims = { uid: input.uid, wid: input.wid, exp: nowMs + TTL_MS };
  const payload = b64urlJson(claims);
  const mac = b64url(createHmac('sha256', key).update(payload).digest());
  return `${payload}.${mac}`;
}

/** Verify a token: signature (timing-safe) + expiry. Returns claims or null. */
export function verifyWorkerSessionToken(
  token: string | undefined | null,
  nowMs: number,
): WorkerSessionClaims | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = b64url(createHmac('sha256', key).update(payload).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: WorkerSessionClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
  } catch {
    return null;
  }
  if (!claims || typeof claims.uid !== 'string' || typeof claims.wid !== 'string') return null;
  if (typeof claims.exp !== 'number' || claims.exp <= nowMs) return null; // expired
  return claims;
}

// ── Next.js cookie I/O (server) ──────────────────────────────────────────────

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
};

/** Set the worker-session cookie after a verified passkey assertion. */
export async function setWorkerSessionCookie(
  input: { uid: string; wid: string },
  nowMs: number,
): Promise<void> {
  const token = signWorkerSession(input, nowMs);
  const store = await cookies();
  store.set(WORKER_SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: Math.floor(TTL_MS / 1000) });
}

/** Read + verify the worker-session cookie. Returns claims or null. */
export async function readWorkerSessionCookie(nowMs: number): Promise<WorkerSessionClaims | null> {
  const store = await cookies();
  return verifyWorkerSessionToken(store.get(WORKER_SESSION_COOKIE)?.value, nowMs);
}

/** Clear the worker-session cookie (sign-out / failed assertion). */
export async function clearWorkerSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(WORKER_SESSION_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 });
}

// ── Open-challenge cookie (discoverable auth, pre-session) ────────────────────
// The app-open challenge cannot be worker-scoped in the DB (no worker yet), so
// it rides a SIGNED HttpOnly cookie. Signing prevents a client from substituting
// its own challenge; single-use (cleared on verify) + 5-min expiry bound replay.

export const OPEN_CHALLENGE_COOKIE = 'flos_pk_chal';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Sign a challenge into a `<payload>.<mac>` token. Throws if no secret. */
export function signOpenChallenge(challenge: string, nowMs: number): string {
  const key = secret();
  if (!key) throw new Error('worker-session: WORKER_SESSION_SECRET not configured');
  const payload = b64urlJson({ c: challenge, exp: nowMs + CHALLENGE_TTL_MS });
  const mac = b64url(createHmac('sha256', key).update(payload).digest());
  return `${payload}.${mac}`;
}

/** Verify a challenge token (signature + expiry). Returns the challenge or null. */
export function verifyOpenChallenge(
  token: string | undefined | null,
  nowMs: number,
): string | null {
  const key = secret();
  if (!key || !token) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const expected = b64url(createHmac('sha256', key).update(payload).digest());
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: { c?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
  } catch {
    return null;
  }
  if (typeof parsed.c !== 'string' || typeof parsed.exp !== 'number' || parsed.exp <= nowMs)
    return null;
  return parsed.c;
}

export async function setOpenChallengeCookie(challenge: string, nowMs: number): Promise<void> {
  const store = await cookies();
  store.set(OPEN_CHALLENGE_COOKIE, signOpenChallenge(challenge, nowMs), {
    ...COOKIE_OPTS,
    maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
  });
}

export async function readOpenChallengeCookie(nowMs: number): Promise<string | null> {
  const store = await cookies();
  return verifyOpenChallenge(store.get(OPEN_CHALLENGE_COOKIE)?.value, nowMs);
}

export async function clearOpenChallengeCookie(): Promise<void> {
  const store = await cookies();
  store.set(OPEN_CHALLENGE_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 });
}
