// Flostruction — Input Sanitization
// Prevents CSV formula injection and validates input bounds.
// Non-negotiable: all worker-supplied strings must be sanitized before export.

/**
 * Sanitize a string to prevent CSV formula injection.
 * Prefixes fields starting with =, +, -, @, tab, or CR with a single quote.
 * This is the OWASP recommended approach for CSV injection prevention.
 */
export function sanitizeCSVValue(value: string): string {
  if (!value) return value;
  const firstChar = value.charAt(0);
  if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Validate and clamp total_hours to reasonable bounds.
 * Max: 24 hours per single shift (construction site max).
 * Min: 0 (never negative).
 */
export const HOURS_BOUNDS = {
  MIN: 0,
  MAX: 24,
} as const;

export function validateTotalHours(hours: number): { valid: boolean; clamped: number; error?: string } {
  if (typeof hours !== 'number' || isNaN(hours)) {
    return { valid: false, clamped: 0, error: 'total_hours must be a number' };
  }
  if (hours < HOURS_BOUNDS.MIN) {
    return { valid: false, clamped: 0, error: `total_hours cannot be negative (got ${hours})` };
  }
  if (hours > HOURS_BOUNDS.MAX) {
    return { valid: false, clamped: HOURS_BOUNDS.MAX, error: `total_hours cannot exceed ${HOURS_BOUNDS.MAX} (got ${hours})` };
  }
  return { valid: true, clamped: hours };
}

/**
 * Validate pay_rate is within reasonable bounds.
 * Min: $0.01 (must be positive).
 * Max: $500.00 (reasonable upper bound for construction).
 */
export const PAY_RATE_BOUNDS = {
  MIN: 0.01,
  MAX: 500.00,
} as const;

export function validatePayRate(rate: number): { valid: boolean; error?: string } {
  if (typeof rate !== 'number' || isNaN(rate)) {
    return { valid: false, error: 'pay_rate must be a number' };
  }
  if (rate < PAY_RATE_BOUNDS.MIN) {
    return { valid: false, error: `pay_rate must be at least $${PAY_RATE_BOUNDS.MIN} (got $${rate})` };
  }
  if (rate > PAY_RATE_BOUNDS.MAX) {
    return { valid: false, error: `pay_rate cannot exceed $${PAY_RATE_BOUNDS.MAX} (got $${rate})` };
  }
  return { valid: true };
}
