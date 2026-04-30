// Phone format normalisation utility — canonical +61XXXXXXXXX
//
// 2026-04-30 evening — substrate-DD finding: Supabase auth.users stores
// phones as `61XXXXXXXXX` (no `+` prefix), while supervisors and workers
// tables store with `+` prefix. Different code paths handle this
// differently. First production phone-format mismatch will cause
// hard-to-debug verification failures. This module is the single source
// of truth for the canonical format and the four context-specific
// derivations.
//
// Canonical (application-layer storage, display output): `+61XXXXXXXXX`
//   E.164 international format with `+` prefix. 12 chars total for
//   Australian mobiles (+61 + 9-digit subscriber number).
//
// Substrate format conversions:
//   - toCanonical(input): accepts loose Australian mobile inputs
//     (0413573579, +61413573579, 61413573579, 04 1357 3579, etc.)
//     returns canonical `+61413573579`. Throws on invalid prefix.
//   - toAuthFormat(canonical): strips `+` for Supabase Auth → `61413573579`
//   - toTwilioFormat(canonical): keeps `+` for Twilio → `+61413573579`
//   - toDisplayFormat(canonical): human-readable → `+61 413 573 579`
//
// Australian mobile spec: 10-digit national format starts with `04`,
// or 11-digit international format starts with `614`. Subscriber number
// is the 9 digits after the `4`.
//
// See ~/Desktop/FLOSTRUCTION-Build/phone-format-substrate-DD-audit-2026-04-30.md
// for the full audit identifying every code path that needs normalisation.

/**
 * Convert any reasonable Australian mobile phone input to canonical
 * `+61XXXXXXXXX` format.
 *
 * Accepts:
 *   - `0413573579` (national format, leading 0)
 *   - `04 1357 3579` (with whitespace)
 *   - `04-1357-3579` (with dashes)
 *   - `+61413573579` (already canonical)
 *   - `+61 413 573 579` (canonical with whitespace)
 *   - `61413573579` (Supabase Auth format, no `+`)
 *
 * Throws:
 *   - On empty / undefined input
 *   - On non-Australian-mobile prefix (must start with `04` or `+614` or `614`)
 *   - On wrong length (final canonical must be 12 chars)
 */
export function toCanonical(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('phoneNormaliser.toCanonical: input must be a non-empty string');
  }
  // Strip whitespace, dashes, parentheses, dots
  const stripped = input.replace(/[\s\-()\.]/g, '');
  if (stripped.length === 0) {
    throw new Error('phoneNormaliser.toCanonical: input contained no digits');
  }

  // Convert all variants to canonical +61 prefix
  let withPlus: string;
  if (stripped.startsWith('+614')) {
    // Already canonical-prefixed (or missing one digit, validated below)
    withPlus = stripped;
  } else if (stripped.startsWith('614')) {
    // Supabase Auth format — add `+`
    withPlus = '+' + stripped;
  } else if (stripped.startsWith('04')) {
    // National format — strip leading 0, add +61
    withPlus = '+61' + stripped.substring(1);
  } else {
    throw new Error(
      `phoneNormaliser.toCanonical: input "${input}" does not match Australian mobile pattern (must start with 04, +614, or 614)`,
    );
  }

  // Validate final canonical length: +61 + 9-digit subscriber = 12 chars
  if (withPlus.length !== 12) {
    throw new Error(
      `phoneNormaliser.toCanonical: input "${input}" produced ${withPlus.length}-char canonical "${withPlus}" but expected 12 chars (+61XXXXXXXXX)`,
    );
  }

  // Validate the subscriber portion is all digits
  const subscriber = withPlus.substring(3); // chars after `+61`
  if (!/^[0-9]{9}$/.test(subscriber)) {
    throw new Error(
      `phoneNormaliser.toCanonical: input "${input}" subscriber portion "${subscriber}" must be 9 digits`,
    );
  }

  // Australian mobile must have `4` as the first subscriber digit (no
  // landlines accepted)
  if (subscriber[0] !== '4') {
    throw new Error(
      `phoneNormaliser.toCanonical: input "${input}" first subscriber digit "${subscriber[0]}" must be 4 (Australian mobile)`,
    );
  }

  return withPlus;
}

/**
 * Strip `+` for Supabase Auth's internal storage convention.
 * Input MUST already be canonical (`+61XXXXXXXXX`).
 */
export function toAuthFormat(canonical: string): string {
  if (!canonical || !canonical.startsWith('+61')) {
    throw new Error(
      `phoneNormaliser.toAuthFormat: input "${canonical}" must be canonical +61XXXXXXXXX`,
    );
  }
  return canonical.substring(1); // strip leading `+`
}

/**
 * Twilio expects E.164 with `+` prefix. Canonical IS the Twilio format.
 * Function exists for explicit semantic clarity at call sites.
 */
export function toTwilioFormat(canonical: string): string {
  if (!canonical || !canonical.startsWith('+61')) {
    throw new Error(
      `phoneNormaliser.toTwilioFormat: input "${canonical}" must be canonical +61XXXXXXXXX`,
    );
  }
  return canonical;
}

/**
 * Human-readable display format: `+61 413 573 579`.
 * Splits subscriber into 3-3-3 blocks.
 */
export function toDisplayFormat(canonical: string): string {
  if (!canonical || !canonical.startsWith('+61') || canonical.length !== 12) {
    throw new Error(
      `phoneNormaliser.toDisplayFormat: input "${canonical}" must be canonical +61XXXXXXXXX`,
    );
  }
  const subscriber = canonical.substring(3); // 9 digits
  return `+61 ${subscriber.substring(0, 3)} ${subscriber.substring(3, 6)} ${subscriber.substring(6, 9)}`;
}
