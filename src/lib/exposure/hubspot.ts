// HubSpot sync for captured Exposure Check leads (§5, slice d).
//
// Server-to-server only (the CSP blocks any client-side HubSpot). Idempotent:
// the contact is UPSERTED by email, so a retry or a repeat check never creates
// a duplicate. Failure-tolerant: the lead is already persisted in Supabase
// before this runs, so any HubSpot error just marks hubspot_sync_status and is
// logged — it never affects the user or loses the lead.
//
// Field mapping reuses EXISTING HubSpot properties only (read 2026-06-28 via
// the HubSpot MCP) — no new/duplicate properties are created:
//   email, firstname, lastname, company, jobtitle, phone  (standard)
//   message              — carries the diagnosis summary (standard)
//   flostruction_source  — existing custom attribution property
//   lifecyclestage='lead', hs_lead_status='NEW'  — on CREATE only (never
//                          downgrades a contact a rep has already progressed)
// The full per-vector diagnosis + suggested opener is attached as a Note, so
// no bespoke scoring properties need to exist in the portal.

import type { ExposureResult } from './types';
import type { EnrichedCompany } from './apollo';
import { leadPriority } from './priority';

const HUBSPOT_BASE = 'https://api.hubapi.com';
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202; // HUBSPOT_DEFINED note→contact

export interface HubSpotLead {
  name: string;
  work_email: string;
  company: string;
  role: string | null;
  phone: string | null;
  source?: string | null;
}

export type HubSpotSyncStatus = 'synced' | 'failed' | 'skipped';

function splitName(full: string): { firstname: string; lastname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 1) return { firstname: full.trim(), lastname: '' };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

const BAND_WORD: Record<string, string> = { clear: 'Clear', watch: 'Watch', exposed: 'Exposed', na: 'N/A' };

/** Pure: build the standard-property patch for the contact. No custom scoring props. */
export function buildContactProperties(
  lead: HubSpotLead,
  result: ExposureResult,
): Record<string, string> {
  const { firstname, lastname } = splitName(lead.name);
  const priority = leadPriority(result.workerBand, result.overall);
  const summary =
    `[${priority.label} priority] Labour Hire Exposure Check — overall ${BAND_WORD[result.overall] ?? result.overall}. ` +
    `Biggest gap: ${result.biggestGap ?? 'none'}. ` +
    `State(s): ${result.states.join(', ') || '—'}; worker band: ${result.workerBand ?? '—'}.`;
  const props: Record<string, string> = {
    email: lead.work_email,
    firstname,
    company: lead.company,
    message: summary,
    flostruction_source: lead.source || 'labour-hire-exposure-check',
  };
  if (lastname) props.lastname = lastname;
  if (lead.role) props.jobtitle = lead.role;
  if (lead.phone) props.phone = lead.phone;
  return props;
}

/** Pure: build the Note body carrying the full diagnosis + suggested opener. */
export function buildNoteBody(result: ExposureResult, enrichment?: EnrichedCompany | null): string {
  const priority = leadPriority(result.workerBand, result.overall);
  const lines = [
    'Labour Hire Exposure Check — result',
    `Priority: ${priority.label} (worker band × exposure; sort rank ${priority.rank})`,
    `Overall: ${BAND_WORD[result.overall] ?? result.overall} | Biggest gap: ${result.biggestGap ?? 'none'}`,
    `State(s): ${result.states.join(', ') || '—'} | Worker band: ${result.workerBand ?? '—'}`,
    '',
    ...result.vectors.map(
      (v) => `• ${v.label}: ${BAND_WORD[v.band] ?? v.band}${v.applicable ? '' : ' (n/a)'}`,
    ),
    '',
    `Suggested opener: ${result.founderOpener}`,
    `Ruleset: ${result.version}`,
  ];
  if (enrichment) {
    lines.push(
      '',
      'Firmographics (Apollo):',
      `• Industry: ${enrichment.industry ?? '—'}`,
      `• Employees: ${enrichment.employees ?? '—'}`,
      `• Website: ${enrichment.website ?? '—'}`,
    );
  }
  return lines.join('\n');
}

async function hsFetch(token: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

/** Upsert the contact by email; returns its id. Creates if it doesn't exist. */
async function upsertContact(
  token: string,
  lead: HubSpotLead,
  result: ExposureResult,
): Promise<string> {
  const properties = buildContactProperties(lead, result);
  // Try update-by-email (idempotent — no duplicate on retry/repeat check).
  const patch = await hsFetch(
    token,
    `/crm/v3/objects/contacts/${encodeURIComponent(lead.work_email)}?idProperty=email`,
    { method: 'PATCH', body: JSON.stringify({ properties }) },
  );
  if (patch.ok) {
    const data = (await patch.json()) as { id: string };
    return data.id;
  }
  if (patch.status !== 404) {
    throw new Error(`hubspot contact upsert failed: ${patch.status}`);
  }
  // Not found → create, seeding lifecycle/status only on first touch.
  const create = await hsFetch(token, '/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({
      properties: { ...properties, lifecyclestage: 'lead', hs_lead_status: 'NEW' },
    }),
  });
  if (!create.ok) throw new Error(`hubspot contact create failed: ${create.status}`);
  const data = (await create.json()) as { id: string };
  return data.id;
}

async function createNote(
  token: string,
  contactId: string,
  body: string,
  timestampIso: string,
): Promise<void> {
  const res = await hsFetch(token, '/crm/v3/objects/notes', {
    method: 'POST',
    body: JSON.stringify({
      properties: { hs_note_body: body, hs_timestamp: timestampIso },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`hubspot note create failed: ${res.status}`);
}

/**
 * Sync a captured lead to HubSpot: upsert the contact, attach a diagnosis Note.
 * Returns a status (never throws) so the caller can record it. No-ops to
 * 'skipped' when no token is configured.
 */
export async function syncExposureLeadToHubSpot(params: {
  lead: HubSpotLead;
  result: ExposureResult;
  enrichment?: EnrichedCompany | null;
  /** ISO timestamp for the note (passed in — engine code avoids Date.now()). */
  timestampIso: string;
}): Promise<HubSpotSyncStatus> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return 'skipped';
  try {
    const contactId = await upsertContact(token, params.lead, params.result);
    await createNote(token, contactId, buildNoteBody(params.result, params.enrichment), params.timestampIso);
    return 'synced';
  } catch {
    return 'failed';
  }
}
