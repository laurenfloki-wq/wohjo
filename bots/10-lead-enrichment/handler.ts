// Bot 10 — Lead enrichment.
//
// Trigger: HubSpot webhook | Runtime: EF + pgmq | Gate: T0 | Model: Haiku
// (only for genuinely ambiguous normalisation, off the happy path).
//
// Deterministic normalisation + dedupe so no duplicate contacts and fields are
// consistent before write-back. The Apollo enrichment call is a connector; the
// pure logic here (normalise, dedupe key) is what we test.

export const BOT_ID = 'bot-10-lead-enrichment';

export interface RawContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
}

export interface NormalisedContact {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  /** Stable dedupe key: lowercased, trimmed email. */
  dedupeKey: string;
}

/** Normalise a phone to E.164-ish for AU: 0xxxxxxxxx -> +61xxxxxxxxx. */
export function normaliseAuPhone(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.length === 0) return null;
  return digits;
}

function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pure normalisation. */
export function normalise(raw: RawContact): NormalisedContact {
  const email = raw.email.trim().toLowerCase();
  return {
    email,
    firstName: raw.firstName ? titleCase(raw.firstName) : null,
    lastName: raw.lastName ? titleCase(raw.lastName) : null,
    phone: raw.phone ? normaliseAuPhone(raw.phone) : null,
    company: raw.company ? raw.company.trim() : null,
    dedupeKey: email,
  };
}

/** Dedupe a batch by dedupe key, keeping the first occurrence. */
export function dedupe(contacts: ReadonlyArray<NormalisedContact>): NormalisedContact[] {
  const seen = new Set<string>();
  const out: NormalisedContact[] = [];
  for (const c of contacts) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    out.push(c);
  }
  return out;
}
