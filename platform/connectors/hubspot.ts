// HubSpot connector — typed fetch wrapper with a scoped private-app token.
// Used by bots 10 (enrichment), 11 (ICP), 12 (scoring), 13 (hygiene),
// 14 (reply qualification), 17 (renewal), 52 (daily brief).

import { requireEnv } from '../env';

const HUBSPOT_API = 'https://api.hubapi.com';

async function hsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${requireEnv('HUBSPOT_PRIVATE_APP_TOKEN')}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HubSpot ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
}

export async function getContact(id: string): Promise<HubSpotContact> {
  return hsFetch(`/crm/v3/objects/contacts/${id}`);
}

export async function updateContact(
  id: string,
  properties: Record<string, string | number | null>,
): Promise<HubSpotContact> {
  return hsFetch(`/crm/v3/objects/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
}

/** List contacts (one page) with the properties the hygiene bot needs. */
export async function listContacts(limit = 100): Promise<HubSpotContact[]> {
  const props = 'email,hs_email_hard_bounce_reason,notes_last_updated,lifecyclestage';
  const out = await hsFetch<{ results: HubSpotContact[] }>(
    `/crm/v3/objects/contacts?limit=${limit}&properties=${props}`,
  );
  return out.results;
}

/**
 * Pure: map a HubSpot contact to the CRM-hygiene shape (bot 13). Email bounce
 * status comes from the hard-bounce reason property; stale days from the last
 * activity timestamp relative to `nowMs`.
 */
export function toCrmContact(
  c: HubSpotContact,
  nowMs: number,
): {
  id: string;
  email: string;
  emailStatus: 'valid' | 'hard_bounce' | 'unknown';
  lastActivityDaysAgo: number;
  stage: string;
} {
  const p = c.properties;
  const bounced = (p.hs_email_hard_bounce_reason ?? '').length > 0;
  const last = p.notes_last_updated ? Date.parse(p.notes_last_updated) : NaN;
  const lastActivityDaysAgo = Number.isNaN(last) ? 9999 : Math.floor((nowMs - last) / 86_400_000);
  return {
    id: c.id,
    email: p.email ?? '',
    emailStatus: bounced ? 'hard_bounce' : 'valid',
    lastActivityDaysAgo,
    stage: p.lifecyclestage ?? 'unknown',
  };
}

export async function searchContactsByEmail(email: string): Promise<HubSpotContact[]> {
  const body = {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    limit: 10,
  };
  const out = await hsFetch<{ results: HubSpotContact[] }>(`/crm/v3/objects/contacts/search`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return out.results;
}
