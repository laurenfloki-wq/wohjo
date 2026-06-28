// /api/exposure/score — server-side scoring endpoint. Pure (no DB/email), so
// we exercise the real handler directly.

import { describe, it, expect } from 'vitest';
import { POST } from './route';

function post(body: unknown, ip = '10.10.0.1') {
  return POST(
    new Request('http://localhost/api/exposure/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/exposure/score', () => {
  it('scores valid answers and never returns the internal founder opener', async () => {
    const res = await post({
      answers: { states: ['queensland'], records_method: 'paper', records_survive: 'no', licence_held: 'no' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: Record<string, unknown> };
    expect(json.result).toBeDefined();
    expect(Array.isArray(json.result.vectors)).toBe(true);
    expect(json.result.version).toBeDefined();
    expect('founderOpener' in json.result).toBe(false);
  });

  it('rejects a malformed payload with 400', async () => {
    const res = await post({ answers: 'not-an-object' }, '10.10.0.2');
    expect(res.status).toBe(400);
  });
});
