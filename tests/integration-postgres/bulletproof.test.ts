// FLOSTRUCTION bulletproof harness — 7 scenarios against real Postgres.
//
// CI hard gate. Each scenario maps to a dispatch requirement
// (1a-1g). Red here blocks merge.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupHarness,
  sha256Hex,
  TENANT_ID,
  WORKER_ID,
  SITE_ID,
  DIRECTOR_USER,
  PAYROLL_USER,
  VIEWER_USER,
  SUPERVISOR_USER,
  ANOMALY_PAYROLL_ID,
  ANOMALY_EXPORT_ID,
  ANOMALY_PAYROLL_HASH,
  ANOMALY_EXPORT_HASH,
  BRIDGE_EVENT_HASH,
  type HarnessHandle,
} from './harness';

let h: HarnessHandle;

beforeAll(async () => {
  h = await setupHarness();
}, 60000);
afterAll(async () => {
  await h?.close();
});

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function insertShift(opts: { receipt: string; status: string; date?: string }) {
  const date = opts.date ?? '2026-06-10';
  await h.query(
    `INSERT INTO shifts (id, company_id, worker_id, site_id, shift_date,
        start_time, end_time, break_minutes, total_hours, receipt_id, status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::date,
        $5::timestamptz, $6::timestamptz,
        0, 8.00, $7, $8)`,
    [
      TENANT_ID,
      WORKER_ID,
      SITE_ID,
      date,
      `${date} 08:00:00+00`,
      `${date} 16:00:00+00`,
      opts.receipt,
      opts.status,
    ],
  );
  const r = await h.query<{ id: string }>(`SELECT id FROM shifts WHERE receipt_id = $1`, [
    opts.receipt,
  ]);
  return r.rows[0].id;
}

async function nextSequentialHash(seed: number): Promise<string> {
  return await sha256Hex(`harness-event-seed-${seed}`);
}

// Insert a sealed v1 row chained off `prevHash`. Returns the new hash.
async function insertV1Event(opts: {
  eventType: string;
  prevHash: string;
  seed: number;
  workerId?: string | null;
  siteId?: string | null;
  eventData?: Record<string, unknown>;
  parentShiftEventId?: string | null;
  correctionReason?: string | null;
  createdBy?: string;
}): Promise<string> {
  const newHash = await nextSequentialHash(opts.seed);
  const wlesEnvelope = {
    event_type: opts.eventType,
    payload: opts.eventData ?? {},
  };
  await h.query(
    `INSERT INTO shift_events
       (company_id, worker_id, site_id, event_type, event_data,
        event_hash, previous_event_hash, spec_version, wles_event,
        created_by, parent_shift_event_id, correction_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, '1.0', $8, $9, $10, $11)`,
    [
      TENANT_ID,
      opts.workerId === undefined ? WORKER_ID : opts.workerId,
      opts.siteId === undefined ? SITE_ID : opts.siteId,
      opts.eventType,
      JSON.stringify(opts.eventData ?? {}),
      newHash,
      opts.prevHash,
      JSON.stringify(wlesEnvelope),
      opts.createdBy ?? DIRECTOR_USER,
      opts.parentShiftEventId ?? null,
      opts.correctionReason ?? null,
    ],
  );
  return newHash;
}

async function brokenLinks(): Promise<number> {
  const r = await h.query<{ n: string }>(`SELECT n FROM count_broken_chain_links()`);
  return Number(r.rows[0].n);
}

// ──────────────────────────────────────────────────────────────────────
// (a) Happy-path lifecycle + envelope
// ──────────────────────────────────────────────────────────────────────

describe('1(a) lifecycle + envelope', () => {
  it('seals a full v1 lifecycle (CLOCK_IN -> CLOCK_OUT -> SHIFT_COMMIT -> SUPERVISOR_APPROVAL -> PAYROLL_APPROVAL -> EXPORT_RECORD) and enforces v1_sealed', async () => {
    let prev = BRIDGE_EVENT_HASH;
    const shiftId = await insertShift({ receipt: 'FSTR-1A-001', status: 'PAYROLL_APPROVED' });

    // START_EVENT (CLOCK_IN semantic) — substrate column keeps START_EVENT.
    prev = await insertV1Event({
      eventType: 'START_EVENT',
      prevHash: prev,
      seed: 11,
      eventData: { shift_id: shiftId },
    });
    prev = await insertV1Event({
      eventType: 'END_EVENT',
      prevHash: prev,
      seed: 12,
      eventData: { shift_id: shiftId },
    });
    prev = await insertV1Event({
      eventType: 'SHIFT_COMMIT',
      prevHash: prev,
      seed: 13,
      eventData: { shift_id: shiftId },
    });
    prev = await insertV1Event({
      eventType: 'SUPERVISOR_APPROVAL',
      prevHash: prev,
      seed: 14,
      eventData: { shift_id: shiftId },
    });
    prev = await insertV1Event({
      eventType: 'PAYROLL_APPROVAL',
      prevHash: prev,
      seed: 15,
      eventData: { shift_id: shiftId, receipt_id: 'FSTR-1A-001' },
    });
    prev = await insertV1Event({
      eventType: 'EXPORT_RECORD',
      prevHash: prev,
      seed: 16,
      eventData: { shift_id: shiftId },
    });

    expect(await brokenLinks()).toBe(0);
    const rows = await h.query<{ event_type: string; spec_version: string; wles_event: unknown }>(
      `SELECT event_type, spec_version, wles_event FROM shift_events
       WHERE created_by = $1 AND event_type IN ('START_EVENT','END_EVENT','SHIFT_COMMIT','SUPERVISOR_APPROVAL','PAYROLL_APPROVAL','EXPORT_RECORD')
       ORDER BY created_at`,
      [DIRECTOR_USER],
    );
    expect(rows.rows).toHaveLength(6);
    for (const r of rows.rows) {
      expect(r.spec_version).toBe('1.0');
      expect(r.wles_event).toBeTruthy(); // v1_sealed enforced
    }
  });

  it('REJECTS a spec_version=1.0 INSERT with wles_event NULL (v1_sealed)', async () => {
    const hash = await sha256Hex('harness-unsealed-attempt');
    await expect(
      h.query(
        `INSERT INTO shift_events
           (company_id, worker_id, site_id, event_type, event_data,
            event_hash, previous_event_hash, spec_version, wles_event, created_by)
         VALUES ($1, $2, $3, 'START_EVENT', '{}', $4, $5, '1.0', NULL, 'test')`,
        [TENANT_ID, WORKER_ID, SITE_ID, hash, BRIDGE_EVENT_HASH],
      ),
    ).rejects.toThrow(/v1_sealed/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (b) Correction path
// ──────────────────────────────────────────────────────────────────────

describe('1(b) correction path', () => {
  it('accepts a valid CORRECTION + chains it + chain stays unbroken', async () => {
    // Set up a parent event to correct.
    const parentHash = await insertV1Event({
      eventType: 'PAYROLL_APPROVAL',
      prevHash: BRIDGE_EVENT_HASH,
      seed: 21,
      eventData: { shift_id: 'parent-shift', receipt_id: 'FSTR-1B-001' },
    });
    const parentRow = await h.query<{ id: string }>(
      `SELECT id FROM shift_events WHERE event_hash = $1`,
      [parentHash],
    );
    const parentId = parentRow.rows[0].id;
    // Find current v1 chain tail.
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await insertV1Event({
      eventType: 'CORRECTION',
      prevHash: tail.rows[0].event_hash,
      seed: 22,
      eventData: { shift_id: 'parent-shift' },
      parentShiftEventId: parentId,
      correctionReason: 'Manual hours adjustment per supervisor sign-off',
    });
    expect(await brokenLinks()).toBe(0);
    const correction = await h.query<{ parent_shift_event_id: string; correction_reason: string }>(
      `SELECT parent_shift_event_id, correction_reason FROM shift_events
       WHERE event_type='CORRECTION' AND correction_reason LIKE 'Manual hours%'`,
    );
    expect(correction.rows[0].parent_shift_event_id).toBe(parentId);
    expect(correction.rows[0].correction_reason).toContain('Manual hours');
  });

  it('REJECTS a CORRECTION with missing parent_shift_event_id', async () => {
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await expect(
      insertV1Event({
        eventType: 'CORRECTION',
        prevHash: tail.rows[0].event_hash,
        seed: 23,
        eventData: { shift_id: 'no-parent' },
        parentShiftEventId: null,
        correctionReason: 'attempt without parent',
      }),
    ).rejects.toThrow(/correction_consistency_check/);
  });

  it('REJECTS a CORRECTION with missing correction_reason', async () => {
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    const someParent = await h.query<{ id: string }>(
      `SELECT id FROM shift_events WHERE event_type='PAYROLL_APPROVAL' LIMIT 1`,
    );
    await expect(
      insertV1Event({
        eventType: 'CORRECTION',
        prevHash: tail.rows[0].event_hash,
        seed: 24,
        eventData: { shift_id: 'no-reason' },
        parentShiftEventId: someParent.rows[0].id,
        correctionReason: null,
      }),
    ).rejects.toThrow(/correction_consistency_check/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (c) Dispute path
// ──────────────────────────────────────────────────────────────────────

describe('1(c) dispute path', () => {
  it('DISPUTE_RAISED is accepted when event_data carries shift_id', async () => {
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await insertV1Event({
      eventType: 'DISPUTE_RAISED',
      prevHash: tail.rows[0].event_hash,
      seed: 31,
      eventData: { shift_id: 'disputed-shift', reason: 'wrong hours' },
    });
    expect(await brokenLinks()).toBe(0);
  });

  it('REJECTS DISPUTE_RAISED without shift_id in event_data (event_data_shape)', async () => {
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await expect(
      insertV1Event({
        eventType: 'DISPUTE_RAISED',
        prevHash: tail.rows[0].event_hash,
        seed: 32,
        eventData: { reason: 'missing shift_id' },
      }),
    ).rejects.toThrow(/event_data_shape/);
  });

  it('WORKER_DISPUTE_FILED accepted; chain unbroken', async () => {
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await insertV1Event({
      eventType: 'WORKER_DISPUTE_FILED',
      prevHash: tail.rows[0].event_hash,
      seed: 33,
      eventData: { dispute_id: 'd1', dispute_type: 'hours_disputed' },
    });
    expect(await brokenLinks()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (d) Idempotency on ingestion (export_packs.idempotency_key UNIQUE)
// ──────────────────────────────────────────────────────────────────────

describe('1(d) idempotency on ingestion', () => {
  it('UNIQUE(idempotency_key) blocks a duplicated pack INSERT', async () => {
    // First export shell needs an exports row to FK back to.
    const shiftId = await insertShift({ receipt: 'FSTR-1D-001', status: 'PAYROLL_APPROVED' });
    await h.query(
      `INSERT INTO exports (id, company_id, pay_period_start, pay_period_end,
            export_target, shift_ids, total_shifts, total_hours, file_hash, exported_by)
       VALUES ('aaaaaaaa-1111-4111-8111-111111111111', $1,
            '2026-06-10','2026-06-10','myob', ARRAY[$2::uuid], 1, 8, 'f0', $3)`,
      [TENANT_ID, shiftId, DIRECTOR_USER],
    );
    const dup = '1'.repeat(64);
    await h.query(
      `INSERT INTO export_packs
         (export_id, canonical_manifest_jsonb, pack_fingerprint, idempotency_key,
          payroll_file_storage_path, payroll_file_mime, payroll_file_hash,
          audit_pack_storage_path, audit_pack_hash, generated_by)
       VALUES ('aaaaaaaa-1111-4111-8111-111111111111', '{}'::jsonb,
          $1, $2, 'p/p.xlsx', 'application/x', $3, 'a/p.pdf', $4, $5)`,
      ['a'.repeat(64), dup, 'b'.repeat(64), 'c'.repeat(64), DIRECTOR_USER],
    );
    // Second INSERT with the SAME idempotency_key must violate UNIQUE.
    await expect(
      h.query(
        `INSERT INTO export_packs
           (export_id, canonical_manifest_jsonb, pack_fingerprint, idempotency_key,
            payroll_file_storage_path, payroll_file_mime, payroll_file_hash,
            audit_pack_storage_path, audit_pack_hash, generated_by)
         VALUES ('aaaaaaaa-1111-4111-8111-111111111111', '{}'::jsonb,
            $1, $2, 'p/p.xlsx', 'application/x', $3, 'a/p.pdf', $4, $5)`,
        [
          'a'.repeat(63) + '2', // different pack_fingerprint
          dup, // SAME idempotency_key
          'b'.repeat(64),
          'c'.repeat(64),
          DIRECTOR_USER,
        ],
      ),
    ).rejects.toThrow(/duplicate key|idempotency_key/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (e) Fail-closed writes (Defect B root) — exercises the in-process
//     route-shape gate via the same env contract.
// ──────────────────────────────────────────────────────────────────────

describe('1(e) fail-closed writes', () => {
  it('isWlesV1Enabled returns FALSE when env is unset', async () => {
    const original = process.env.WLES_V1_ENABLED;
    delete process.env.WLES_V1_ENABLED;
    try {
      const { isWlesV1Enabled } = await import('@/lib/wles/flags');
      expect(isWlesV1Enabled()).toBe(false);
    } finally {
      if (original !== undefined) process.env.WLES_V1_ENABLED = original;
    }
  });

  // The companion isWlesTypeRegistryLocked() flag-guard test is held
  // back until the M4 type-registry-lock work merges to main (the
  // export adding `isWlesTypeRegistryLocked` to @/lib/wles/flags is
  // on phase1/export-verification-spine, not yet on main — tracked
  // under #116 migration/code drift). Add the sub-assertion in the
  // same PR that merges that export so the gate covers both flags.

  it('substrate refuses spec_version=0 post-cutover even if a route silently fell through', async () => {
    const hash = await sha256Hex('harness-fail-closed-v0-attempt');
    await expect(
      h.query(
        `INSERT INTO shift_events
           (company_id, worker_id, site_id, event_type, event_data,
            event_hash, previous_event_hash, spec_version, created_by, created_at)
         VALUES ($1, $2, $3, 'EXPORT_RECORD',
                 jsonb_build_object('shift_id','x'),
                 $4, $5, '0', 'test', '2026-06-08T00:00:00Z')`,
        [TENANT_ID, WORKER_ID, SITE_ID, hash, ANOMALY_EXPORT_HASH],
      ),
    ).rejects.toThrow(/post_cutover_spec_v1/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (f) Post-cutover + anomaly coexistence
// ──────────────────────────────────────────────────────────────────────

describe('1(f) post-cutover + anomaly coexistence', () => {
  it('the two seeded anomaly rows are still readable and unmutated', async () => {
    const r = await h.query<{ id: string; event_hash: string; spec_version: string }>(
      `SELECT id, event_hash, spec_version FROM shift_events
       WHERE id IN ($1, $2) ORDER BY created_at`,
      [ANOMALY_PAYROLL_ID, ANOMALY_EXPORT_ID],
    );
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].event_hash).toBe(ANOMALY_PAYROLL_HASH);
    expect(r.rows[1].event_hash).toBe(ANOMALY_EXPORT_HASH);
    expect(r.rows[0].spec_version).toBe('0');
    expect(r.rows[1].spec_version).toBe('0');
  });

  it('UPDATE on an anomaly row trips the NOT VALID constraint', async () => {
    await expect(
      h.query(
        `UPDATE shift_events SET event_data = jsonb_build_object('shift_id','TAMPER')
         WHERE id = $1`,
        [ANOMALY_PAYROLL_ID],
      ),
    ).rejects.toThrow(/post_cutover_spec_v1/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// (g) Taxonomy guard
// ──────────────────────────────────────────────────────────────────────

describe('1(g) taxonomy guard', () => {
  it('REJECTS an X-FLOSMOSIS-CORRECTION substrate event_type (core events stay un-prefixed)', async () => {
    const hash = await sha256Hex('harness-x-prefix-correction');
    const tail = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    await expect(
      h.query(
        `INSERT INTO shift_events
           (company_id, worker_id, event_type, event_data,
            event_hash, previous_event_hash, spec_version, wles_event,
            created_by)
         VALUES ($1, $2, 'X-FLOSMOSIS-CORRECTION',
                 jsonb_build_object('shift_id','x'),
                 $3, $4, '1.0',
                 jsonb_build_object('event_type','X-FLOSMOSIS-CORRECTION'),
                 'test')`,
        [TENANT_ID, WORKER_ID, hash, tail.rows[0].event_hash],
      ),
    ).rejects.toThrow(/event_type_check/);
  });

  it('the two protocol/meta extension types STILL validate (bridge + anomaly)', async () => {
    const r = await h.query<{ event_type: string }>(
      `SELECT event_type FROM shift_events
       WHERE event_type IN
         ('X-FLOSMOSIS-SPEC_VERSION_MIGRATION','X-FLOSMOSIS-SPEC_VERSION_ANOMALY')`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// WI-3 access-semantics proof for the export_packs RLS init-plan fix.
// ──────────────────────────────────────────────────────────────────────

describe('WI-3 export_packs RLS access semantics (post init-plan fix)', () => {
  it("an admin of the export's company can SELECT its export_packs", async () => {
    // Seed a pack + export so the policy has something to evaluate.
    const exportId = '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await h.query(
      `INSERT INTO exports (id, company_id, pay_period_start, pay_period_end,
            export_target, shift_ids, total_shifts, total_hours, file_hash, exported_by)
       VALUES ($1, $2, '2026-06-10','2026-06-10','myob', ARRAY[]::uuid[],
            0, 0, 'h', $3) ON CONFLICT DO NOTHING`,
      [exportId, TENANT_ID, DIRECTOR_USER],
    );
    const fp = 'f'.repeat(64);
    const idk = '5'.repeat(64);
    await h.query(
      `INSERT INTO export_packs
         (export_id, canonical_manifest_jsonb, pack_fingerprint, idempotency_key,
          payroll_file_storage_path, payroll_file_mime, payroll_file_hash,
          audit_pack_storage_path, audit_pack_hash, generated_by)
       VALUES ($1, '{}'::jsonb, $2, $3, 'p', 'application/x',
          '6' || repeat('0', 63), 'a', '7' || repeat('0', 63), $4)
       ON CONFLICT DO NOTHING`,
      [exportId, fp, idk, DIRECTOR_USER],
    );

    // Director of the tenant: should SEE (table is FORCE RLS).
    await h.withUser(DIRECTOR_USER, async () => {
      const r = await h.query<{ id: string }>(
        `SELECT id FROM export_packs WHERE pack_fingerprint = $1`,
        [fp],
      );
      expect(r.rows.length).toBeGreaterThan(0);
    });
  });

  it('a non-admin (unauthenticated) sees ZERO rows under RLS', async () => {
    const fp = 'f'.repeat(64);
    // No app.current_user_id set -> auth.uid() returns null -> policy denies.
    await h.withUser(null, async () => {
      const r = await h.query<{ id: string }>(
        `SELECT id FROM export_packs WHERE pack_fingerprint = $1`,
        [fp],
      );
      expect(r.rows).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// (h) m0d lifecycle substrate-name invariant
//
// Both approval layers seal as the WLES committed type APPROVAL, but the
// SUBSTRATE event_type column MUST carry the FLOSTRUCTION canonical bare
// name (SUPERVISOR_APPROVAL / PAYROLL_APPROVAL / EXPORT_RECORD) so it stays
// inside shift_events_event_type_check and keys the bare-name CHECK
// constraints. This is the eventTypeForSubstrate split (Change 1 / D3).
// Guards against a regression that writes the WLES/X- name to the column.
// ──────────────────────────────────────────────────────────────────────

describe('1(h) m0d lifecycle substrate-name invariant', () => {
  async function v1Tail(): Promise<string> {
    const t = await h.query<{ event_hash: string }>(
      `SELECT event_hash FROM shift_events WHERE spec_version='1.0'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    return t.rows[0].event_hash;
  }

  it('REJECTS a v1 approval whose SUBSTRATE event_type is the WLES committed name APPROVAL', async () => {
    const hash = await sha256Hex('harness-1h-approval-substrate');
    const prev = await v1Tail();
    await expect(
      h.query(
        `INSERT INTO shift_events
           (company_id, worker_id, site_id, event_type, event_data,
            event_hash, previous_event_hash, spec_version, wles_event, created_by)
         VALUES ($1,$2,$3,'APPROVAL', jsonb_build_object('shift_id','x'),
                 $4,$5,'1.0',
                 jsonb_build_object('event_type','APPROVAL','payload',
                   jsonb_build_object('shift_id','x','layer','supervisor')),
                 'test')`,
        [TENANT_ID, WORKER_ID, SITE_ID, hash, prev],
      ),
    ).rejects.toThrow(/event_type_check/);
  });

  it('ACCEPTS the supervisor split (substrate SUPERVISOR_APPROVAL + wles_event APPROVAL/layer supervisor); columns differ; chain unbroken', async () => {
    const hash = await sha256Hex('harness-1h-supervisor-split');
    const prev = await v1Tail();
    await h.query(
      `INSERT INTO shift_events
         (company_id, worker_id, site_id, event_type, event_data,
          event_hash, previous_event_hash, spec_version, wles_event, created_by)
       VALUES ($1,$2,$3,'SUPERVISOR_APPROVAL', jsonb_build_object('shift_id','x'),
               $4,$5,'1.0',
               jsonb_build_object('event_type','APPROVAL','payload',
                 jsonb_build_object('shift_id','x','layer','supervisor')),
               'test')`,
      [TENANT_ID, WORKER_ID, SITE_ID, hash, prev],
    );
    const row = await h.query<{ event_type: string; wles_type: string; layer: string }>(
      `SELECT event_type,
              wles_event->>'event_type' AS wles_type,
              wles_event->'payload'->>'layer' AS layer
       FROM shift_events WHERE event_hash = $1`,
      [hash],
    );
    expect(row.rows[0].event_type).toBe('SUPERVISOR_APPROVAL'); // substrate canonical
    expect(row.rows[0].wles_type).toBe('APPROVAL'); // WLES committed type
    expect(row.rows[0].layer).toBe('supervisor');
    expect(await brokenLinks()).toBe(0);
  });

  it('ACCEPTS the payroll split (substrate PAYROLL_APPROVAL + wles_event APPROVAL/layer payroll); chain unbroken', async () => {
    const hash = await sha256Hex('harness-1h-payroll-split');
    const prev = await v1Tail();
    await h.query(
      `INSERT INTO shift_events
         (company_id, worker_id, site_id, event_type, event_data,
          event_hash, previous_event_hash, spec_version, wles_event, created_by)
       VALUES ($1,$2,$3,'PAYROLL_APPROVAL',
               jsonb_build_object('shift_id','x','receipt_id','FSTR-1H'),
               $4,$5,'1.0',
               jsonb_build_object('event_type','APPROVAL','payload',
                 jsonb_build_object('shift_id','x','layer','payroll')),
               'test')`,
      [TENANT_ID, WORKER_ID, SITE_ID, hash, prev],
    );
    const row = await h.query<{ event_type: string; wles_type: string }>(
      `SELECT event_type, wles_event->>'event_type' AS wles_type
       FROM shift_events WHERE event_hash = $1`,
      [hash],
    );
    expect(row.rows[0].event_type).toBe('PAYROLL_APPROVAL');
    expect(row.rows[0].wles_type).toBe('APPROVAL');
    expect(await brokenLinks()).toBe(0);
  });

  it('ACCEPTS the export split (substrate EXPORT_RECORD + wles_event X-FLOSMOSIS-EXPORT_RECORD); chain unbroken', async () => {
    const hash = await sha256Hex('harness-1h-export-split');
    const prev = await v1Tail();
    await h.query(
      `INSERT INTO shift_events
         (company_id, worker_id, site_id, event_type, event_data,
          event_hash, previous_event_hash, spec_version, wles_event, created_by)
       VALUES ($1,$2,$3,'EXPORT_RECORD', jsonb_build_object('shift_id','x'),
               $4,$5,'1.0',
               jsonb_build_object('event_type','X-FLOSMOSIS-EXPORT_RECORD','payload',
                 jsonb_build_object('shift_id','x')),
               'test')`,
      [TENANT_ID, WORKER_ID, SITE_ID, hash, prev],
    );
    const row = await h.query<{ event_type: string; wles_type: string }>(
      `SELECT event_type, wles_event->>'event_type' AS wles_type
       FROM shift_events WHERE event_hash = $1`,
      [hash],
    );
    expect(row.rows[0].event_type).toBe('EXPORT_RECORD'); // substrate canonical
    expect(row.rows[0].wles_type).toBe('X-FLOSMOSIS-EXPORT_RECORD'); // WLES extension type
    expect(await brokenLinks()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 1(i) passkey app-access — the SMS/phone-OTP floor is permanent
//
// Phase A (WORKER_PASSKEY_ACCESS) adds a passkey as a convenience layer
// ON TOP OF the SMS floor; it never replaces it. Two invariants the whole
// design rests on, proven against real Postgres:
//   - A passkey-minted (webauthn-sourced) APP_ACCESS grant does NOT satisfy
//     the enrollment floor (hasActiveCodeVerifyGrant is SMS-sourced only),
//     so a passkey session can never self-perpetuate further enrollment.
//   - The SMS path is ALWAYS reachable: enrolled passkeys never block a
//     worker from minting a fresh SMS-sourced APP_ACCESS grant.
// Auth-only: this scenario never touches shift_events or the WLES chain.
// ──────────────────────────────────────────────────────────────────────

describe('1(i) passkey app-access — SMS fallback always reachable', () => {
  // Mirror of worker-passkey.ts hasActiveCodeVerifyGrant (SMS-sourced only).
  async function smsFloorSatisfied(workerId: string): Promise<boolean> {
    const r = await h.query<{ id: string }>(
      `SELECT id FROM worker_mfa_grants
         WHERE worker_id = $1 AND challenge_id IS NOT NULL
           AND consumed_at IS NULL AND expires_at > now() LIMIT 1`,
      [workerId],
    );
    return r.rows.length > 0;
  }

  it('an enrolled passkey + a passkey grant never bypass the SMS enrollment floor', async () => {
    // The worker has a passkey enrolled and an active passkey-sourced grant.
    await h.query(
      `INSERT INTO worker_webauthn_credentials (worker_id, credential_id, public_key, sign_count)
       VALUES ($1, 'bp-cred', 'bp-pubkey', 3)`,
      [WORKER_ID],
    );
    const authChal = await h.query<{ id: string }>(
      `INSERT INTO worker_webauthn_challenges (worker_id, challenge, ceremony, expires_at)
       VALUES ($1, 'bp-chal', 'authenticate', now() + interval '5 minutes') RETURNING id`,
      [WORKER_ID],
    );
    await h.query(
      `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, webauthn_challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'bp-ua')`,
      [WORKER_ID, authChal.rows[0].id],
    );
    // Passkey access works, but the SMS floor remains UNSATISFIED — enrolling
    // another passkey still demands a fresh SMS verify.
    expect(await smsFloorSatisfied(WORKER_ID)).toBe(false);
  });

  it('the SMS path is always reachable: an APP_ACCESS code-verify mints an SMS-sourced grant', async () => {
    // Even with a passkey enrolled, the worker can still request + verify an
    // SMS APP_ACCESS code (worker_mfa_challenges.challenge_for allows APP_ACCESS)
    // and mint an SMS-sourced grant — satisfying the floor.
    const smsChal = await h.query<{ id: string }>(
      `INSERT INTO worker_mfa_challenges (worker_id, challenge_for, code_hash, expires_at)
       VALUES ($1, 'APP_ACCESS', 'scrypt$bp', now() + interval '5 minutes') RETURNING id`,
      [WORKER_ID],
    );
    await h.query(
      `INSERT INTO worker_mfa_grants (worker_id, challenge_for, expires_at, challenge_id, device_binding)
       VALUES ($1, 'APP_ACCESS', now() + interval '15 minutes', $2, 'bp-ua')`,
      [WORKER_ID, smsChal.rows[0].id],
    );
    expect(await smsFloorSatisfied(WORKER_ID)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Chain-integrity adversarial detection
//
// v1 chain integrity is NOT prevented at write time — the per-row
// trigger explicitly bypasses spec_version='1.0' (see
// validate_shift_event_chain in bootstrap.sql, mirroring production
// per src/lib/wles/v1-chain.ts:71-73 "the daily chain-verify cron
// catches the resulting chain break"). Integrity is enforced
// observationally via count_broken_chain_links() — the same function
// the cron sweep calls.
//
// This test plants a deliberate break (a v1 row whose
// previous_event_hash does not match any existing event_hash) via
// the service-role write path the harness already uses, then proves
// the planted break is DETECTED. Runs LAST so the planted break
// does not pollute earlier scenarios' `brokenLinks() === 0`
// assertions.
// ──────────────────────────────────────────────────────────────────────

describe('chain-integrity adversarial detection (sweep, not reject)', () => {
  it('plants a v1 row with a non-existent previous_event_hash; INSERT succeeds; count_broken_chain_links() > 0', async () => {
    const baseline = await h.query<{ n: string }>(`SELECT n FROM count_broken_chain_links()`);
    const baselineCount = Number(baseline.rows[0].n);

    // A hex string that is well-formed (passes event_hash_format) but
    // is NOT the event_hash of any existing row in the chain.
    const planted = 'deadbeef'.repeat(8);
    const orphanPrev = 'cafebabe'.repeat(8);
    expect(planted).toMatch(/^[0-9a-f]{64}$/);
    expect(orphanPrev).toMatch(/^[0-9a-f]{64}$/);

    // Insert via the direct service-role-style path. The v1 chain
    // trigger is bypassed, so the row lands.
    await h.query(
      `INSERT INTO shift_events
         (company_id, worker_id, site_id, event_type, event_data,
          event_hash, previous_event_hash, spec_version, wles_event,
          created_by)
       VALUES ($1, $2, $3, 'PAYROLL_APPROVAL',
               jsonb_build_object('shift_id','adversarial'),
               $4, $5, '1.0',
               jsonb_build_object('event_type','PAYROLL_APPROVAL'),
               'test:adversarial-chain-break')`,
      [TENANT_ID, WORKER_ID, SITE_ID, planted, orphanPrev],
    );

    const after = await h.query<{ n: string }>(`SELECT n FROM count_broken_chain_links()`);
    const afterCount = Number(after.rows[0].n);
    expect(afterCount).toBeGreaterThan(baselineCount);
  });
});
