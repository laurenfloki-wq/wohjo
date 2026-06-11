// W6 / SG-7 — secrets-inventory completeness (2026-06-11).
//
// Walks every process.env.* reference under src/ and asserts the name
// appears in docs/secrets-inventory.md. A new env var without an
// inventory row is a build failure — the inventory cannot rot.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DOC = fs.readFileSync(path.join(process.cwd(), 'docs/secrets-inventory.md'), 'utf-8');

function collectEnvNames(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
        const s = fs.readFileSync(full, 'utf-8');
        for (const m of s.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
          names.add(m[1]);
        }
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return names;
}

describe('W6 — secrets inventory completeness', () => {
  it('every env var referenced in src/ has an inventory row', () => {
    const missing = [...collectEnvNames()].filter((n) => !DOC.includes(n)).sort();
    expect(missing).toEqual([]);
  });

  it('the standing rules are present', () => {
    expect(DOC).toContain('service-client.ts');
    expect(DOC).toContain('NEXT_PUBLIC_');
    expect(DOC).toContain('2026-09-10');
  });
});
