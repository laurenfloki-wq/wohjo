// W1.4 slice G repo-confinement guard (2026-06-10) — the final slice:
// sign-in identity surfaces + system surfaces, plus the global
// zero-direct-client pin for the whole route tree.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8');

const IDENTITY_ROUTES = [
  'src/app/api/field/role-detect/route.ts',
  'src/app/api/field/bootstrap-worker/route.ts',
];

const SYSTEM_ROUTES = [
  'src/app/api/cron/dispatcher-reconcile/route.ts',
  'src/app/api/cron/integrity-report-monthly/route.ts',
  'src/app/api/cron/intelligence-collusion-pairs/route.ts',
  'src/app/api/cron/keepalive/route.ts',
  'src/app/api/cron/rotate-verify-tokens/route.ts',
  'src/app/api/cron/supervisor-batch/route.ts',
  'src/app/api/cron/verify-hashes/route.ts',
  'src/app/api/cron/substrate-health/route.ts',
  'src/app/api/webhooks/twilio/sms-reply/route.ts',
];

describe('W1.4g — identity-derivation routes', () => {
  for (const file of IDENTITY_ROUTES) {
    it(`${file}: session verified before any identity lookup; no raw client`, () => {
      const s = read(file);
      expect(s).not.toMatch(/createServiceClient/);
      expect(s).not.toMatch(/\.from\((['"`])/);
      const auth = s.indexOf('auth.getUser(');
      expect(auth).toBeGreaterThan(-1);
      for (const fn of [
        'activeWorkerByUserId(',
        'bootstrapWorkerByPhone(',
        'linkWorkerToUser(',
      ]) {
        const i = s.indexOf(fn);
        if (i !== -1) expect(i).toBeGreaterThan(auth);
      }
    });
  }
});

describe('W1.4g — system surfaces use the loud accessor', () => {
  for (const file of SYSTEM_ROUTES) {
    it(`${file}: getServiceClientForSystemJob, never the supabase/server import`, () => {
      const s = read(file);
      expect(s).toMatch(/getServiceClientForSystemJob\(\)/);
      expect(s).not.toMatch(/from ['"]@\/lib\/supabase\/server['"]/);
    });
  }
});

describe('W1.4g — global zero-direct-client pin (SG-2)', () => {
  it('no route file anywhere imports or calls createServiceClient', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name === 'route.ts') {
          if (fs.readFileSync(full, 'utf-8').includes('createServiceClient')) {
            offenders.push(full);
          }
        }
      }
    };
    walk(path.join(process.cwd(), 'src/app'));
    expect(offenders).toEqual([]);
  });
});
