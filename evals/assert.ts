// Shared eval helpers.

import { expect } from 'vitest';
import { containsEmoji } from '../platform/guard';

/** Assert a value (string or any JSON-serialisable structure) carries no emoji. */
export function expectNoEmoji(value: unknown): void {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  expect(containsEmoji(text), 'output must contain no emoji (HARD CONSTRAINT 6)').toBe(false);
}

/** Assert a thrown GuardError carries the expected code. */
export function expectGuardCode(fn: () => void, code: string): void {
  try {
    fn();
    throw new Error(`expected GuardError(${code}) but nothing was thrown`);
  } catch (err) {
    expect((err as { code?: string }).code, `expected GuardError code ${code}`).toBe(code);
  }
}
