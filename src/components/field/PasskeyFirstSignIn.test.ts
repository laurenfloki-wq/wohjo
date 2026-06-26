// W2(2) — app-open passkey-first component (source-assertion; node test env).
// Pins the no-dead-end guarantees: renders nothing when the feature is off,
// falls through to SMS on any failure/cancel, posts to the open endpoints.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'PasskeyFirstSignIn.tsx'), 'utf8');

describe('PasskeyFirstSignIn', () => {
  it('probes the app-open options endpoint and renders nothing when off', () => {
    expect(SRC).toMatch(/\/api\/worker\/passkey\/auth-options-open/);
    expect(SRC).toMatch(/if \(!res\.ok\) return/); // 404 → feature off → render nothing
    expect(SRC).toMatch(/if \(!options\) return null/);
  });

  it('verifies via the app-open verify endpoint and lands in /field/home on success', () => {
    expect(SRC).toMatch(/\/api\/worker\/passkey\/auth-verify-open/);
    expect(SRC).toMatch(/\/field\/home/);
  });

  it('any failure or cancel falls through to the SMS form (no dead-end)', () => {
    expect(SRC).toMatch(/catch\s*\{/);
    expect(SRC.toLowerCase()).toMatch(/sms code below/);
  });

  it('fires WebAuthn inside the tap gesture (options pre-fetched on mount)', () => {
    expect(SRC).toMatch(/useEffect/);
    expect(SRC).toMatch(/startAuthentication\(\{ optionsJSON: options \}\)/);
  });
});
