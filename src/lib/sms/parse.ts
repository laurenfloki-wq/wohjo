// Flostruction — SMS Reply Parser
// Pure function — no database calls, no side effects, fully unit-testable.
// Adapted from research/sms-parser-raw.ts to match Flostruction spec:
//   - Codes are LAST 6 CHARS of receipt_id (e.g., FSTR-ABC123 → ABC123)
//   - YES ALL / Y ALL / bare YES (if single clean shift) → approve all clean shifts
//   - YES [CODE] / Y [CODE] → approve single shift by code
//   - NO [CODE] / N [CODE] → dispute single shift
//   - ? / HELP / COMMANDS → help text
//   - Anything else → unrecognised

export type SMSAction =
  | 'YES_ALL'
  | 'YES_CODE'
  | 'NO_CODE'
  | 'HELP'
  | 'UNKNOWN';

export interface ParsedSMS {
  action: SMSAction;
  code: string | null;     // 6-char code if YES [CODE] or NO [CODE]
  rawInput: string;
}

/**
 * Parse an inbound SMS body into a structured command.
 * Per spec: trim() and toUpperCase() before matching.
 * Check in order — first match wins.
 */
export function parseSMSReply(
  body: string,
  pendingCodes: string[]
): ParsedSMS {
  const rawInput = body ?? '';
  const normalised = rawInput.trim().toUpperCase().replace(/\s+/g, ' ');

  if (!normalised) {
    return { action: 'UNKNOWN', code: null, rawInput };
  }

  // 1. YES ALL | Y ALL
  if (/^(YES|Y)\s+ALL$/i.test(normalised)) {
    return { action: 'YES_ALL', code: null, rawInput };
  }

  // Also match single "YES" or "Y" when there is only one clean pending shift
  if (/^(YES|Y)$/.test(normalised) && pendingCodes.length === 1) {
    return { action: 'YES_ALL', code: null, rawInput };
  }

  // 2. YES [CODE] | Y [CODE] — minimum 4 chars match, case-insensitive
  const yesMatch = normalised.match(/^(YES|Y)\s+([A-Z0-9]{4,})$/);
  if (yesMatch) {
    const inputCode = yesMatch[2];
    const matchedCode = findMatchingCode(inputCode, pendingCodes);
    if (matchedCode) {
      return { action: 'YES_CODE', code: matchedCode, rawInput };
    }
    // Code provided but not found — still parse as YES_CODE with the raw code
    return { action: 'YES_CODE', code: inputCode, rawInput };
  }

  // 3. NO [CODE] | N [CODE]
  const noMatch = normalised.match(/^(NO|N)\s+([A-Z0-9]{4,})$/);
  if (noMatch) {
    const inputCode = noMatch[2];
    const matchedCode = findMatchingCode(inputCode, pendingCodes);
    if (matchedCode) {
      return { action: 'NO_CODE', code: matchedCode, rawInput };
    }
    return { action: 'NO_CODE', code: inputCode, rawInput };
  }

  // 4. HELP / ? / COMMANDS
  if (/^(\?|HELP|COMMANDS)$/.test(normalised)) {
    return { action: 'HELP', code: null, rawInput };
  }

  // 5. Anything else
  return { action: 'UNKNOWN', code: null, rawInput };
}

/**
 * Match an input code against pending codes.
 * Case-insensitive, contains match (minimum 4 chars).
 */
function findMatchingCode(
  inputCode: string,
  pendingCodes: string[]
): string | null {
  const input = inputCode.toUpperCase();
  // Exact match first
  const exact = pendingCodes.find((c) => c.toUpperCase() === input);
  if (exact) return exact;

  // Contains match (input is substring of code or code is substring of input)
  const partial = pendingCodes.find(
    (c) =>
      c.toUpperCase().includes(input) || input.includes(c.toUpperCase())
  );
  return partial ?? null;
}
