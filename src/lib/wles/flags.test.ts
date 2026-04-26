// WLES feature flags — tests.
//
// These tests lock in the fail-closed default. Any change that
// causes `isWlesV1Enabled()` to return `true` when the env var is
// unset, empty, or misspelt is a CONFORMANCE-GATE REGRESSION and
// CI must fail.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isWlesV1Enabled, wlesV1EnabledRaw } from './flags';

describe('isWlesV1Enabled — fail-closed default', () => {
  const originalValue = process.env.WLES_V1_ENABLED;

  beforeEach(() => {
    delete process.env.WLES_V1_ENABLED;
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.WLES_V1_ENABLED;
    } else {
      process.env.WLES_V1_ENABLED = originalValue;
    }
  });

  it('returns FALSE when the env var is unset', () => {
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is empty string', () => {
    process.env.WLES_V1_ENABLED = '';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "false"', () => {
    process.env.WLES_V1_ENABLED = 'false';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "0"', () => {
    process.env.WLES_V1_ENABLED = '0';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "1" (truthy but not literally "true")', () => {
    process.env.WLES_V1_ENABLED = '1';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "TRUE" (wrong case)', () => {
    process.env.WLES_V1_ENABLED = 'TRUE';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "True" (mixed case)', () => {
    process.env.WLES_V1_ENABLED = 'True';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "truee" (typo)', () => {
    process.env.WLES_V1_ENABLED = 'truee';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is " true" (leading whitespace)', () => {
    process.env.WLES_V1_ENABLED = ' true';
    expect(isWlesV1Enabled()).toBe(false);
  });

  it('returns FALSE when the env var is "yes"', () => {
    process.env.WLES_V1_ENABLED = 'yes';
    expect(isWlesV1Enabled()).toBe(false);
  });
});

describe('isWlesV1Enabled — explicit activation', () => {
  const originalValue = process.env.WLES_V1_ENABLED;
  beforeEach(() => { delete process.env.WLES_V1_ENABLED; });
  afterEach(() => {
    if (originalValue === undefined) delete process.env.WLES_V1_ENABLED;
    else process.env.WLES_V1_ENABLED = originalValue;
  });

  it('returns TRUE only when the env var is EXACTLY the string "true"', () => {
    process.env.WLES_V1_ENABLED = 'true';
    expect(isWlesV1Enabled()).toBe(true);
  });

  it('re-reads the env var on every call (not cached)', () => {
    expect(isWlesV1Enabled()).toBe(false);
    process.env.WLES_V1_ENABLED = 'true';
    expect(isWlesV1Enabled()).toBe(true);
    delete process.env.WLES_V1_ENABLED;
    expect(isWlesV1Enabled()).toBe(false);
  });
});

describe('wlesV1EnabledRaw — diagnostic helper', () => {
  const originalValue = process.env.WLES_V1_ENABLED;
  beforeEach(() => { delete process.env.WLES_V1_ENABLED; });
  afterEach(() => {
    if (originalValue === undefined) delete process.env.WLES_V1_ENABLED;
    else process.env.WLES_V1_ENABLED = originalValue;
  });

  it('returns undefined when unset', () => {
    expect(wlesV1EnabledRaw()).toBeUndefined();
  });

  it('returns the literal string value when set', () => {
    process.env.WLES_V1_ENABLED = 'true';
    expect(wlesV1EnabledRaw()).toBe('true');
    process.env.WLES_V1_ENABLED = 'TRUE';
    expect(wlesV1EnabledRaw()).toBe('TRUE');
  });
});
