// queue.ts — pgmq (Postgres message queue) wrappers for durable work.
//
// Money/evidence bots enqueue here and a worker Edge Function drains the queue
// (triggered every minute by pg_cron). Handlers MUST be idempotent: they claim
// an idempotency key before doing any consequential work, so a redelivered
// message or a re-drained queue causes no duplicate side-effect.

import { db } from './db';
import { record } from './audit';
import type { BotId } from './types';

/** Ensure a queue exists (idempotent). Call once at deploy / first use. */
export async function ensureQueue(topic: string): Promise<void> {
  const sql = db();
  await sql`select pgmq.create(${topic})`;
}

/** Enqueue a message. Returns the pgmq message id. */
export async function enqueue(topic: string, msg: Record<string, unknown>): Promise<number> {
  const sql = db();
  const rows = await sql<{ msg_id: number }[]>`
    select * from pgmq.send(${topic}, ${sql.json(msg as Parameters<typeof sql.json>[0])}) as msg_id
  `;
  const row = rows[0];
  if (!row) throw new Error(`enqueue: pgmq.send returned no id for topic ${topic}`);
  return row.msg_id;
}

/**
 * Claim an idempotency key. Returns true if this caller won the claim (first
 * time), false if the key was already claimed (work already done / in flight).
 * Uses ON CONFLICT DO NOTHING so the claim is atomic.
 */
export async function claimIdempotency(key: string, botId: BotId): Promise<boolean> {
  const sql = db();
  const rows = await sql<{ key: string }[]>`
    insert into bot_idempotency_keys (key, bot_id)
    values (${key}, ${botId})
    on conflict (key) do nothing
    returning key
  `;
  return rows.length > 0;
}

export interface QueueMessage<T = Record<string, unknown>> {
  msgId: number;
  readCt: number;
  message: T;
}

/**
 * Drain up to `batch` messages from a topic, invoking `handler` for each.
 * On success the message is archived; on throw it is left for pgmq's visibility
 * timeout to redeliver (with backoff via vt). The handler is responsible for
 * idempotency via claimIdempotency.
 */
export async function drain<T extends object>(
  topic: string,
  botId: BotId,
  handler: (msg: QueueMessage<T>) => Promise<void>,
  opts: { batch?: number; vtSeconds?: number } = {},
): Promise<{ processed: number; failed: number }> {
  const sql = db();
  const batch = opts.batch ?? 10;
  const vt = opts.vtSeconds ?? 60;

  const rows = await sql<{ msg_id: number; read_ct: number; message: T }[]>`
    select msg_id, read_ct, message
    from pgmq.read(${topic}, ${vt}, ${batch})
  `;

  let processed = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await handler({ msgId: r.msg_id, readCt: r.read_ct, message: r.message });
      await sql`select pgmq.archive(${topic}, ${r.msg_id}::bigint)`;
      processed++;
    } catch (err) {
      failed++;
      await record({
        botId,
        action: 'queue.handler.error',
        detail: {
          topic,
          msgId: r.msg_id,
          readCt: r.read_ct,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      // Leave the message; pgmq will redeliver after vt. Could route to a DLQ
      // after a max read_ct threshold.
    }
  }
  return { processed, failed };
}
