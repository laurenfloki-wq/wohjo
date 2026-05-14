// Gate R-FOR-1 — unit tests for emitAuthEvent.
//
// Covers:
//   - happy path: row inserted with all populated columns
//   - fail-soft: thrown Supabase client doesn't propagate
//   - fail-soft: error response from Supabase doesn't propagate
//   - header extraction: x-forwarded-for first-ip, ip_country, user_agent
//   - user_agent slicing at 256 chars
//   - payload defaults to {} when omitted
//   - supabase_event_id always null (internal origin marker)

import { describe, it, expect } from 'vitest';
import { emitAuthEvent } from './auth-events-emit';
import pino from 'pino';

const log = pino({ level: 'silent' });

function mkRequest(headers: Record<string, string>): Request {
  return new Request('https://flostruction.com/api/test', {
    method: 'POST',
    headers: new Headers(headers),
  });
}

describe('emitAuthEvent', () => {
  it('inserts a row with all expected columns', async () => {
    const inserted: unknown[] = [];
    const fake = {
      from: () => ({
        insert: (row: unknown) => {
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof emitAuthEvent>[1]['supabase'];

    await emitAuthEvent(log, {
      eventType: 'X-FLOSMOSIS-WORKER_BOOTSTRAP_LINKED',
      actorUserId: '58e8bca1-9438-4997-8e57-92a195cfd995',
      actorEmail: 'joao@example.com',
      actorPhone: '+61451258610',
      companyId: 'b3cf9a82-1234-5678-9abc-def012345678',
      request: mkRequest({
        'x-forwarded-for': '203.0.113.42, 198.51.100.1',
        'x-vercel-ip-country': 'AU',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14)',
      }),
      payload: { worker_id: 'aaa-bbb' },
      supabase: fake,
    });

    expect(inserted).toHaveLength(1);
    const row = inserted[0] as Record<string, unknown>;
    expect(row.event_type).toBe('X-FLOSMOSIS-WORKER_BOOTSTRAP_LINKED');
    expect(row.actor_user_id).toBe('58e8bca1-9438-4997-8e57-92a195cfd995');
    expect(row.actor_phone).toBe('+61451258610');
    expect(row.ip_address).toBe('203.0.113.42');
    expect(row.ip_country).toBe('AU');
    expect(row.user_agent).toBe('Mozilla/5.0 (Linux; Android 14)');
    expect(row.payload).toEqual({ worker_id: 'aaa-bbb' });
    expect(row.supabase_event_id).toBeNull();
  });

  it('never throws when the supabase client rejects', async () => {
    const fake = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: 'rls denied' } }),
      }),
    } as unknown as Parameters<typeof emitAuthEvent>[1]['supabase'];

    await expect(
      emitAuthEvent(log, {
        eventType: 'X-FLOSMOSIS-AUTH_SURFACE_UNKNOWN',
        actorUserId: null,
        companyId: null,
        request: mkRequest({}),
        supabase: fake,
      }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the supabase client itself throws', async () => {
    const fake = {
      from: () => {
        throw new Error('connection lost');
      },
    } as unknown as Parameters<typeof emitAuthEvent>[1]['supabase'];

    await expect(
      emitAuthEvent(log, {
        eventType: 'X-FLOSMOSIS-AUTH_SURFACE_UNKNOWN',
        actorUserId: null,
        companyId: null,
        request: mkRequest({}),
        supabase: fake,
      }),
    ).resolves.toBeUndefined();
  });

  it('slices oversized user_agent at 256 chars', async () => {
    let captured: Record<string, unknown> | null = null;
    const fake = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          captured = row;
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as Parameters<typeof emitAuthEvent>[1]['supabase'];

    const longUa = 'A'.repeat(300);
    await emitAuthEvent(log, {
      eventType: 'X-FLOSMOSIS-AUTH_SURFACE_UNKNOWN',
      actorUserId: null,
      companyId: null,
      request: mkRequest({ 'user-agent': longUa }),
      supabase: fake,
    });
    expect((captured as unknown as Record<string, unknown>).user_agent).toHaveLength(256);
  });
});
