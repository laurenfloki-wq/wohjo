// Evidence-Pack verification addressing.
//
// One capability URL serves BOTH downstream audiences for a kept run:
//   • a human scans the QR on the PDF/HTML pack → a "VERIFIED" landing
//     page re-checked live against the WLES ledger;
//   • a payroll system GETs the same URL with `Accept: application/json`
//     → machine-readable hours + chain status, to confirm the hours it
//     is about to pay match the verified ledger.
//
// The token is the export's `file_hash` (a SHA-256 already sealed into
// the WLES EXPORT_RECORD event). It is a capability: only a holder of
// the genuine export/CSV/pack knows it, so possession authorises the
// (read-only) lookup — no separate secret or schema column needed. A
// token that resolves to nothing is itself a tamper signal: the
// document was altered or was never issued by Flostruction.

/** Public base URL — same source as the transactional email links. */
export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://flosmosis.com';
}

/** 64-char lowercase SHA-256 — the shape of a valid verification token. */
const TOKEN_RE = /^[0-9a-f]{64}$/;

export function isValidVerifyToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

/** The capability token for an export — its sealed file hash. */
export function verifyTokenForExport(fileHash: string): string {
  return fileHash;
}

/** Absolute verification URL for a token (what the QR and CSV point to). */
export function verifyUrl(token: string): string {
  return `${appBaseUrl()}/verify/${token}`;
}

/**
 * Normalise operator/paste input to a token. Accepts either a bare
 * 64-hex file hash or a full `…/verify/<token>` link. Returns null when
 * the input isn't a well-formed token.
 */
export function parseVerifyToken(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const fromUrl = s.match(/\/verify\/([0-9a-fA-F]{64})/);
  const candidate = (fromUrl ? fromUrl[1] : s).toLowerCase();
  return isValidVerifyToken(candidate) ? candidate : null;
}
