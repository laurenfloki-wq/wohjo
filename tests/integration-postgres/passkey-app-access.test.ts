// Phase A (WORKER_PASSKEY_ACCESS) — passkey app-access against real Postgres.
//
// Proves the increment-2 DB contract that the route + ceremony code depends on,
// against the rebuilt PG harness (PGlite — real CHECK constraints, real
// triggers). Auth-only: nothing here touches shift_events or the WLES chain.
//
// Scenarios:
//   1. enroll → authenticate → grant   (the happy path, at the DB layer)
//   2. register-without-SMS-grant → 403 (the SMS enrollment floor query)
//   3. a passkey-minted grant does NOT satisfy the enrollment floor
//      (self-perpetuation hole closed: hasActiveCodeVerifyGrant is SMS-only)
//   4. one-source CHECK — a grant needs exactly one origin
//   5. append-only credential guard — credential_id / public_key immutable
//   6. single-use challenge — a consumed challenge can't be reused
//   7. APP_ACCESS is a valid challenge_for on both challenge + grant tables

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupHarness, WORKER_ID, type HarnessHandle } from './harness';

let h: HarnessHandle;

beforeAll(async () => {
  h = await setupHarness();
}, 60000);
afterAll(async () => {
  await h?.close();
});

// ── Helpers ────────────────────────────────────────────────────────────

/** Mirror of worker-passkey.ts hasActiveCodeVerifyGrant — SMS-sourced only. */
async function hasActiveCodeVerifyGrant(workerId: string): Promise<boolean> {
  const r = await h.query<{ id: string }>(
    `SELECT id FROM worker_mfa_grants
       WHERE worker_id = $1
         AND challenge_id IS NOT NULL          -- SMS-sourced (excludes passkey grants)
         AND consumed_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
    [workerId],
  );
  return r.rows.length > 0;
}

async function insertSmsChallenge(action: string): Promise<string> {
  const r = await h.query<{ id: string }>(
    `INSERT INTO worker_mfa_challenges (worker_id, challenge_for, code_hash, expires_at)
     VALUES ($1, $2, 'scrypt$fake', now() + interval '5 minutes') RETURNING id`,
    [WORKER_ID, action],
  );
  return r.rows[0].id;
}

async function insertWebauthnChallenge(ceremony: string): Promise<string> {
  const r = await h.query<{ id: string }>(
    `INSERT INTO worker_webauthn_challenges (worker_id, challenge, ceremony, expires_at)
     VALUES ($1, $2, $3, now() + interval '5 minutes') RETURNING id`,
    [WORKER_ID, `chal-${ceremony}-${Math.round(Math.E * 1e9)}`, ceremony],
  );
  return r.rows[0].id;
}

// ── Scenarios ──────────────────────────────────────────────────────────

describe('passkey app-access — DB contract on rebuilt PG', () => {
  it('1. enroll → authenticate → grant (happy path)', async () => {
    // ENROLL: a register challenge is consumed, a credential is inserted.
    const regChal = await insertWebauthnChallenge('register');
    await h.query(`UPDATE worker_webauthn_challenges SET consumed_at = now() WHERE id = $1`, [
      regChal,
    ]);
    await h.query(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key, sign_count)
       VALUES ($1, 'cred-enroll-1', 'cose-pubkey-1', 0)`,
      [WORKER_ID],
    );

    // AUTHENTICATE: an authenticate challenge is consumed; sign_count advances.
    const authChal = await insertWebauthnChallenge('authenticate');
    await h.query(`UPDATE worker_webauthn_challenges SET consumed_at = now() WHERE id = $1`, [
      authChal,
    ]);
    await h.query(
      `UPDATE worker_webauthn_credentials SET sign_count = 1, last_used_at = now()
         WHERE credential_id = 'cred-enroll-1'`,
    );

    // GRANT: the passkey assertion mints an APP_ACCESS grant sourced from the
    // exact authenticate challenge it consumed (webauthn_challenge_id).
    await h.query(
      `INSERT INTO worker_mfa_grants
         (worker_id, challenge_for, expires_at, webauthn_challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'sha256-ua')`,
      [WORKER_ID, authChal],
    );

    const grant = await h.query<{ challenge_for: string; challenge_id: string | null }>(
      `SELECT challenge_for, challenge_id FROM worker_mfa_grants WHERE webauthn_challenge_id = $1`,
      [authChal],
    );
    expect(grant.rows).toHaveLength(1);
    expect(grant.rows[0].challenge_for).toBe('APP_ACCESS');
    expect(grant.rows[0].challenge_id).toBeNull(); // passkey-sourced, not SMS
  });

  it('2. register without an SMS grant → enrollment floor query returns false (route 403s)', async () => {
    const fresh = '00000000-2000-0000-0000-0000000000ff';
    await h.query(
      `INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id, is_active)
       SELECT $1, company_id, 'No', 'Grant', '+61400000999', 'EMP-NG', true
       FROM workers WHERE id = $2`,
      [fresh, WORKER_ID],
    );
    // No grant of any kind → the SMS floor is not satisfied.
    expect(await hasActiveCodeVerifyGrant(fresh)).toBe(false);

    // An SMS APP_ACCESS code-verify mints an SMS-sourced grant → floor satisfied.
    const smsChal = await h.query<{ id: string }>(
      `INSERT INTO worker_mfa_challenges (worker_id, challenge_for, code_hash, expires_at)
       VALUES ($1, 'APP_ACCESS', 'scrypt$fake', now() + interval '5 minutes') RETURNING id`,
      [fresh],
    );
    await h.query(
      `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'sha256-ua')`,
      [fresh, smsChal.rows[0].id],
    );
    expect(await hasActiveCodeVerifyGrant(fresh)).toBe(true);
  });

  it('3. a passkey-minted grant does NOT satisfy the enrollment floor (no self-perpetuation)', async () => {
    const fresh = '00000000-2000-0000-0000-0000000000ee';
    await h.query(
      `INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id, is_active)
       SELECT $1, company_id, 'Pass', 'Key', '+61400000888', 'EMP-PK', true
       FROM workers WHERE id = $2`,
      [fresh, WORKER_ID],
    );
    const authChal = await h.query<{ id: string }>(
      `INSERT INTO worker_webauthn_challenges (worker_id, challenge, ceremony, expires_at)
       VALUES ($1, 'chal-pp', 'authenticate', now() + interval '5 minutes') RETURNING id`,
      [fresh],
    );
    // Mint ONLY a passkey-sourced APP_ACCESS grant.
    await h.query(
      `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, webauthn_challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'sha256-ua')`,
      [fresh, authChal.rows[0].id],
    );
    // It authorizes app access but NOT enrolling further passkeys.
    expect(await hasActiveCodeVerifyGrant(fresh)).toBe(false);
  });

  it('4. one-source CHECK — a grant needs exactly one origin', async () => {
    const sms = await insertSmsChallenge('APP_ACCESS');
    const passkey = await insertWebauthnChallenge('authenticate');

    // Neither source → rejected.
    await expect(
      h.query(
        `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at)
         VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes')`,
        [WORKER_ID],
      ),
    ).rejects.toThrow(/worker_mfa_grants_one_source/);

    // Both sources → rejected.
    await expect(
      h.query(
        `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, challenge_id, webauthn_challenge_id)
         VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, $3)`,
        [WORKER_ID, sms, passkey],
      ),
    ).rejects.toThrow(/worker_mfa_grants_one_source/);

    // Exactly one → accepted.
    await expect(
      h.query(
        `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, challenge_id)
         VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2)`,
        [WORKER_ID, sms],
      ),
    ).resolves.toBeDefined();
  });

  it('5. append-only credential guard — credential_id + public_key immutable', async () => {
    await h.query(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key, sign_count)
       VALUES ($1, 'cred-immutable', 'cose-pubkey-immutable', 0)`,
      [WORKER_ID],
    );
    // sign_count + last_used_at + status remain updatable.
    await expect(
      h.query(
        `UPDATE worker_webauthn_credentials SET sign_count = 5, last_used_at = now()
           WHERE credential_id = 'cred-immutable'`,
      ),
    ).resolves.toBeDefined();
    await expect(
      h.query(
        `UPDATE worker_webauthn_credentials SET status = 'revoked' WHERE credential_id = 'cred-immutable'`,
      ),
    ).resolves.toBeDefined();
    // credential_id is immutable.
    await expect(
      h.query(
        `UPDATE worker_webauthn_credentials SET credential_id = 'cred-swapped'
           WHERE credential_id = 'cred-immutable'`,
      ),
    ).rejects.toThrow(/credential_id is immutable/);
    // public_key is immutable.
    await expect(
      h.query(
        `UPDATE worker_webauthn_credentials SET public_key = 'cose-pubkey-swapped'
           WHERE credential_id = 'cred-immutable'`,
      ),
    ).rejects.toThrow(/public_key is immutable/);
  });

  it('6. single-use challenge — consume is idempotent (a concurrent verify wins once)', async () => {
    const chal = await insertWebauthnChallenge('authenticate');
    // Optimistic single-use consume: WHERE consumed_at IS NULL.
    const first = await h.query<{ id: string }>(
      `UPDATE worker_webauthn_challenges SET consumed_at = now()
         WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [chal],
    );
    expect(first.rows).toHaveLength(1); // this caller consumed it
    const second = await h.query<{ id: string }>(
      `UPDATE worker_webauthn_challenges SET consumed_at = now()
         WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [chal],
    );
    expect(second.rows).toHaveLength(0); // a second consume returns nothing
  });

  it('7. APP_ACCESS is a valid challenge_for on both challenge + grant tables', async () => {
    await expect(insertSmsChallenge('APP_ACCESS')).resolves.toBeDefined();
    // An out-of-set value is rejected by the widened CHECK on both tables.
    await expect(insertSmsChallenge('ARBITRARY_ACTION')).rejects.toThrow(
      /worker_mfa_challenges_challenge_for_check/,
    );
  });

  it('8. revoke (DELETE) is permitted by the append-only guard and is worker-scoped', async () => {
    // Append-only guard blocks UPDATE of key material but NOT delete — so a
    // worker can revoke a device (revokeCredential = hard DELETE), and the
    // delete is scoped so a session only ever removes its OWN device.
    // Fresh subjects so this scenario is independent of credentials inserted
    // by earlier scenarios on the shared (beforeAll) harness.
    const subject = '00000000-2000-0000-0000-0000000000cc';
    const other = '00000000-2000-0000-0000-0000000000dd';
    for (const [id, emp, phone] of [
      [subject, 'EMP-SUB', '+61400000766'],
      [other, 'EMP-OW', '+61400000777'],
    ] as const) {
      await h.query(
        `INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id, is_active)
         SELECT $1, company_id, 'Rev', 'Subject', $3, $2, true FROM workers WHERE id = $4`,
        [id, emp, phone, WORKER_ID],
      );
    }
    const a = await h.query<{ id: string }>(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key)
       VALUES ($1, 'rev-a', 'pk-a') RETURNING id`,
      [subject],
    );
    await h.query(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key)
       VALUES ($1, 'rev-b', 'pk-b')`,
      [subject],
    );
    const c = await h.query<{ id: string }>(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key)
       VALUES ($1, 'rev-c', 'pk-c') RETURNING id`,
      [other],
    );

    // Worker-scoped revoke of their own device removes exactly one row.
    const delA = await h.query<{ id: string }>(
      `DELETE FROM worker_webauthn_credentials WHERE worker_id = $1 AND id = $2 RETURNING id`,
      [subject, a.rows[0].id],
    );
    expect(delA.rows).toHaveLength(1);

    // Attempting to revoke another worker's device removes nothing (scoped).
    const delOther = await h.query<{ id: string }>(
      `DELETE FROM worker_webauthn_credentials WHERE worker_id = $1 AND id = $2 RETURNING id`,
      [subject, c.rows[0].id],
    );
    expect(delOther.rows).toHaveLength(0);

    // The worker still has their other device; the other worker keeps theirs.
    const remaining = await h.query<{ credential_id: string }>(
      `SELECT credential_id FROM worker_webauthn_credentials WHERE worker_id = $1`,
      [subject],
    );
    expect(remaining.rows.map((r) => r.credential_id)).toEqual(['rev-b']);
    const otherRows = await h.query<{ credential_id: string }>(
      `SELECT credential_id FROM worker_webauthn_credentials WHERE worker_id = $1`,
      [other],
    );
    expect(otherRows.rows.map((r) => r.credential_id)).toEqual(['rev-c']);
  });

  it('9. app-open discoverable lookup is unique + worker-scoped, and respects is_active', async () => {
    // Mirrors getActiveCredentialByCredentialId + getActiveWorkerUserId. The
    // credential_id UNIQUE constraint means a discoverable lookup resolves to
    // exactly ONE worker (never cross-tenant), and a deactivated worker yields
    // no user_id (so a passkey can never log a deactivated worker in).
    const wActive = '00000000-2000-0000-0000-0000000000ab';
    const wInactive = '00000000-2000-0000-0000-0000000000ac';
    await h.query(
      `INSERT INTO workers (id, company_id, user_id, first_name, last_name, phone, employee_id, is_active)
       SELECT $1, company_id, $2, 'Act', 'Ive', '+61400000111', 'EMP-AC', true FROM workers WHERE id = $3`,
      [wActive, '11111111-1111-4111-8111-111111111111', WORKER_ID],
    );
    await h.query(
      `INSERT INTO workers (id, company_id, user_id, first_name, last_name, phone, employee_id, is_active)
       SELECT $1, company_id, $2, 'In', 'Active', '+61400000222', 'EMP-IN', false FROM workers WHERE id = $3`,
      [wInactive, '22222222-2222-4222-8222-222222222222', WORKER_ID],
    );
    await h.query(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key)
       VALUES ($1, 'disc-active', 'pk-act'), ($2, 'disc-inactive', 'pk-ina')`,
      [wActive, wInactive],
    );

    // Discoverable lookup resolves to exactly the owning worker.
    const found = await h.query<{ worker_id: string }>(
      `SELECT worker_id FROM worker_webauthn_credentials WHERE credential_id = 'disc-active' AND status = 'active'`,
    );
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0].worker_id).toBe(wActive);

    // credential_id is globally UNIQUE — no second worker can collide.
    await expect(
      h.query(
        `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key)
         VALUES ($1, 'disc-active', 'pk-dup')`,
        [wInactive],
      ),
    ).rejects.toThrow();

    // Active worker → user_id resolves (login allowed).
    const activeUid = await h.query<{ user_id: string | null }>(
      `SELECT user_id FROM workers WHERE id = $1 AND is_active = true`,
      [wActive],
    );
    expect(activeUid.rows[0]?.user_id).toBe('11111111-1111-4111-8111-111111111111');

    // Deactivated worker → no active user_id (login refused even with a valid passkey).
    const inactiveUid = await h.query<{ user_id: string | null }>(
      `SELECT user_id FROM workers WHERE id = $1 AND is_active = true`,
      [wInactive],
    );
    expect(inactiveUid.rows).toHaveLength(0);

    // Unknown credential → nothing (route returns SMS fallback).
    const unknown = await h.query(
      `SELECT 1 FROM worker_webauthn_credentials WHERE credential_id = 'nope' AND status = 'active'`,
    );
    expect(unknown.rows).toHaveLength(0);
  });

  it('10. phone-OTP enrolment grant is SMS-sourced and satisfies the enrolment floor', async () => {
    // Mirrors mintPhoneOtpEnrolmentGrant: a consumed APP_ACCESS challenge + an
    // unconsumed SMS-sourced (challenge_id) grant. hasActiveCodeVerifyGrant then
    // authorises enrolment — for a phone worker with NO email.
    const subject = '00000000-2000-0000-0000-0000000000ba';
    await h.query(
      `INSERT INTO workers (id, company_id, first_name, last_name, phone, employee_id, is_active)
       SELECT $1, company_id, 'Otp', 'Worker', '+61400000333', 'EMP-OTP', true FROM workers WHERE id = $2`,
      [subject, WORKER_ID],
    );
    // Floor not yet satisfied.
    expect(await hasActiveCodeVerifyGrant(subject)).toBe(false);

    const chal = await h.query<{ id: string }>(
      `INSERT INTO worker_mfa_challenges (worker_id, challenge_for, code_hash, expires_at, consumed_at)
       VALUES ($1, 'APP_ACCESS', 'phone-otp', now() + interval '15 minutes', now()) RETURNING id`,
      [subject],
    );
    await h.query(
      `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'ua')`,
      [subject, chal.rows[0].id],
    );

    // The grant is SMS-sourced and authorises enrolment.
    expect(await hasActiveCodeVerifyGrant(subject)).toBe(true);
    const src = await h.query<{
      challenge_id: string | null;
      webauthn_challenge_id: string | null;
    }>(
      `SELECT challenge_id, webauthn_challenge_id FROM worker_mfa_grants
         WHERE worker_id = $1 AND challenge_for = 'APP_ACCESS'`,
      [subject],
    );
    expect(src.rows[0].challenge_id).not.toBeNull();
    expect(src.rows[0].webauthn_challenge_id).toBeNull();
  });
});
