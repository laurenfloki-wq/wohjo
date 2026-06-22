// Short-lived signed action token for the supervisor verify surface.
//
// The verify link carries a per-supervisor verify_token that lives ~24h —
// fine for *identifying* the supervisor, but a long window for *acting*. This
// adds a stateless, short-lived (30 min) signed token that the approve/dispute
// routes require: it kills stale-link replay and direct-API/CSRF use without
// adding any user-facing step (the page mints one at auth and replays it).
//
// "Frictionless + bounded risk" (founder call 2026-06-18): this does NOT stop
// a promptly-forwarded link — only a possession step-up would — but it bounds
// the action window and pairs with the existing controls (site-scoping,
// rate-limit, worker-notify on approval, full WLES audit, single-effect
// status guards). Enforcement is gated by VERIFY_REQUIRE_ACTION_TOKEN so it
// can be switched on once verified in production.

import { createHmac, timingSafeEqual } from 'crypto';

const TTL_SECONDS = 30 * 60;
const PURPOSE = 'verify-action-v1';

/** Derive the signing key from an already-present server secret so enabling
 *  enforcement needs no new env var. Returns null if no secret is available. */
function signingKey(): Buffer | null {
  const base = process.env.CRON_SECRET ?? process.env.TWILIO_AUTH_TOKEN ?? '';
  if (base.length === 0) return null;
  return createHmac('sha256', base).update(PURPOSE).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, key: Buffer): string {
  return b64url(createHmac('sha256', key).update(payload).digest());
}

/** True when the routes should require a valid action token.
 *  AUTH-1 (audit): enforce by DEFAULT in production (the replay-defence
 *  mechanism + its tests already exist), lenient elsewhere so previews/dev
 *  without the minted token aren't blocked. Kill-switch:
 *  VERIFY_REQUIRE_ACTION_TOKEN='false' disables it; ='true' forces it on. */
export function actionTokenRequired(): boolean {
  const flag = process.env.VERIFY_REQUIRE_ACTION_TOKEN;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.VERCEL_ENV === 'production';
}

/** Mint a token for a supervisor, valid for TTL_SECONDS from `nowMs`.
 *  Returns null when no signing secret is configured (mechanism inert). */
export function mintActionToken(supervisorId: string, nowMs: number): string | null {
  const key = signingKey();
  if (key === null) return null;
  const exp = Math.floor(nowMs / 1000) + TTL_SECONDS;
  const payload = `${supervisorId}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

export type ActionTokenResult =
  | 'valid'
  | 'missing'
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'wrong_subject';

/** Verify a token belongs to `supervisorId` and hasn't expired. */
export function verifyActionToken(
  token: string | null | undefined,
  supervisorId: string,
  nowMs: number,
): ActionTokenResult {
  if (!token) return 'missing';
  const key = signingKey();
  if (key === null) return 'missing';
  const parts = token.split('.');
  if (parts.length !== 3) return 'malformed';
  const [sub, expStr, sig] = parts;
  const payload = `${sub}.${expStr}`;
  const expected = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'bad_signature';
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || Math.floor(nowMs / 1000) > exp) return 'expired';
  if (sub !== supervisorId) return 'wrong_subject';
  return 'valid';
}
