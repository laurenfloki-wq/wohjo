// ABN (Australian Business Number) validation per ATO algorithm.
// https://abr.business.gov.au/Help/AbnFormat
//
// Algorithm:
//   1. Subtract 1 from the leading digit.
//   2. Multiply each digit by the weighting factor:
//      [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
//   3. Sum the products.
//   4. Divide by 89; if remainder is 0 → valid.
//
// The function below accepts either a raw user string (with spaces /
// dashes) or 11 digits. Returns either a normalized 11-digit string or
// null. No external lookup — strictly the checksum.

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/**
 * Strip whitespace, dashes, and parentheses from a user-entered ABN.
 * Returns the digits-only string regardless of validity.
 */
export function abnDigits(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/[\s\-()]/g, '');
}

/**
 * Validate an ABN. Returns the canonical 11-digit string if valid,
 * null otherwise.
 */
export function validateABN(raw: string | null | undefined): string | null {
  const d = abnDigits(raw);
  if (!/^[0-9]{11}$/.test(d)) return null;
  const digits = d.split('').map((c) => Number.parseInt(c, 10));
  // Subtract 1 from the leading digit.
  digits[0] = digits[0] - 1;
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += digits[i] * WEIGHTS[i];
  return sum % 89 === 0 ? d : null;
}

/**
 * Format an ABN for display: "11 222 333 444".
 */
export function formatABN(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
}
