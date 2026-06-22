// SEC-1 guard — the preview-login passwordless director backdoor must stay
// deleted. It minted a real /command session gated only by FLOS_PREVIEW_LOGIN,
// so a single mis-set Vercel env var was a full account takeover. This test
// fails the build if the route reappears or any source references the flag.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('SEC-1 — preview-login backdoor stays deleted', () => {
  it('the /api/preview-login route does not exist', () => {
    expect(existsSync(join(SRC, 'app', 'api', 'preview-login'))).toBe(false);
  });

  it('no source file references the FLOS_PREVIEW_LOGIN flag', () => {
    const offenders = walkTs(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('FLOS_PREVIEW_LOGIN'))
      .map((f) => f.replace(SRC, 'src'));
    expect(offenders).toEqual([]);
  });
});
