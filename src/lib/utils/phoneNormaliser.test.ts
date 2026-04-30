// Phone normaliser tests — pin canonical format invariant
//
// 12 edge case tests covering every input format we expect, plus
// rejection paths for invalid inputs. Test file exists to detect any
// regression in the normalisation contract — the four functions form
// a substrate-DD invariant that's referenced by the bulk worker import,
// the worker-app sign-in flow, and the supervisor-batch SMS routing.

import { describe, it, expect } from 'vitest';
import {
  toCanonical,
  toAuthFormat,
  toTwilioFormat,
  toDisplayFormat,
} from './phoneNormaliser';

describe('toCanonical', () => {
  it('accepts national format with leading 0', () => {
    expect(toCanonical('0413573579')).toBe('+61413573579');
  });

  it('accepts national format with whitespace', () => {
    expect(toCanonical('04 1357 3579')).toBe('+61413573579');
  });

  it('accepts national format with dashes', () => {
    expect(toCanonical('04-1357-3579')).toBe('+61413573579');
  });

  it('accepts already-canonical input unchanged', () => {
    expect(toCanonical('+61413573579')).toBe('+61413573579');
  });

  it('accepts canonical with whitespace', () => {
    expect(toCanonical('+61 413 573 579')).toBe('+61413573579');
  });

  it('accepts Supabase Auth format (no plus prefix)', () => {
    expect(toCanonical('61413573579')).toBe('+61413573579');
  });

  it('accepts mixed separators', () => {
    expect(toCanonical('04 1357.3579')).toBe('+61413573579');
  });

  it('rejects empty input', () => {
    expect(() => toCanonical('')).toThrow(/non-empty string/);
  });

  it('rejects whitespace-only input', () => {
    expect(() => toCanonical('   ')).toThrow(/no digits/);
  });

  it('rejects non-Australian-mobile prefix', () => {
    expect(() => toCanonical('+1234567890')).toThrow(/Australian mobile pattern/);
  });

  it('rejects landline (+612... falls through prefix gate)', () => {
    // +61298765432 starts with +612, not +614, so the pattern gate
    // catches it before subscriber-digit validation. Either error
    // message is correct — the input is rejected.
    expect(() => toCanonical('+61298765432')).toThrow(/Australian mobile pattern|must be 4/);
  });

  it('rejects wrong length', () => {
    expect(() => toCanonical('041357357')).toThrow(); // too short
  });
});

describe('toAuthFormat', () => {
  it('strips + prefix for Supabase Auth', () => {
    expect(toAuthFormat('+61413573579')).toBe('61413573579');
  });

  it('rejects non-canonical input', () => {
    expect(() => toAuthFormat('0413573579')).toThrow(/canonical/);
  });
});

describe('toTwilioFormat', () => {
  it('returns canonical unchanged (Twilio uses E.164 with +)', () => {
    expect(toTwilioFormat('+61413573579')).toBe('+61413573579');
  });

  it('rejects non-canonical input', () => {
    expect(() => toTwilioFormat('61413573579')).toThrow(/canonical/);
  });
});

describe('toDisplayFormat', () => {
  it('formats canonical for human display', () => {
    expect(toDisplayFormat('+61413573579')).toBe('+61 413 573 579');
  });

  it('rejects non-canonical input', () => {
    expect(() => toDisplayFormat('0413573579')).toThrow(/canonical/);
  });

  it('rejects wrong length', () => {
    expect(() => toDisplayFormat('+6141357357')).toThrow(/canonical/);
  });
});

describe('round-trip preservation', () => {
  it('canonical → auth → re-derive canonical gives same canonical', () => {
    const canonical = toCanonical('0413573579');
    const auth = toAuthFormat(canonical);
    const reCanonical = toCanonical(auth);
    expect(reCanonical).toBe(canonical);
  });

  it('every accepted input variant produces identical canonical output', () => {
    const variants = [
      '0413573579',
      '+61413573579',
      '61413573579',
      '04 1357 3579',
      '+61 413 573 579',
      '04-1357-3579',
    ];
    const canonicals = variants.map(toCanonical);
    expect(new Set(canonicals).size).toBe(1);
    expect(canonicals[0]).toBe('+61413573579');
  });
});
