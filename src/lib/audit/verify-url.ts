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
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.flosmosis.com';
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

// Receipt codes (FSTR-XXXXXXXX) are the human-sized identifier printed on
// every pack — the intuitive thing an operator reaches for. The suffix is
// upper-case alphanumeric; we accept it case-insensitively and normalise.
const RECEIPT_RE = /^FSTR-[A-Z0-9]{4,}$/;

export function isValidReceipt(s: string): boolean {
  return RECEIPT_RE.test(s.trim().toUpperCase());
}

export type VerifyQuery = { kind: 'hash'; value: string } | { kind: 'receipt'; value: string };

/**
 * Classify operator input into the authed verify lookup it implies:
 * a file hash / verify link (→ exact pack) or a receipt code (→ the pack
 * that shift belongs to). Returns null for anything unrecognised, so the
 * UI can nudge before a pointless round-trip.
 */
export function classifyVerifyQuery(raw: string): VerifyQuery | null {
  const token = parseVerifyToken(raw);
  if (token) return { kind: 'hash', value: token };
  const receipt = raw.trim().toUpperCase();
  if (isValidReceipt(receipt)) return { kind: 'receipt', value: receipt };
  return null;
}
