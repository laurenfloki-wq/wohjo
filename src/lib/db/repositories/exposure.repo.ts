// Exposure Check repository — the only place exposure tables are written.
//
// Unlike the tenant repositories, these are PROSPECT tables (no companyId to
// bind): a firm taking the check is not yet a tenant. Writes use the
// service-role client (confined here, per src/lib/db/service-client.ts) and go
// only through the validated /api/exposure/lead route.

import { getServiceClient } from '@/lib/db/service-client';

export interface ExposureSubmissionInput {
  ruleset_version: string;
  answers: Record<string, unknown>;
  scores: Record<string, unknown>;
  states: string[];
  worker_band: string | null;
  overall: string;
  biggest_gap: string | null;
  source?: string | null;
  utm?: Record<string, string> | null;
  session_id?: string | null;
}

export interface ExposureLeadInput {
  submission_id: string;
  name: string;
  work_email: string;
  company: string;
  role: string | null;
  phone: string | null;
  consent: boolean;
}

export function exposureRepo() {
  const db = getServiceClient();
  return {
    /** Insert the (PII-free) submission; returns { data: { id }, error }. */
    createSubmission: (input: ExposureSubmissionInput) =>
      db.from('exposure_submissions').insert(input).select('id').single(),

    /** Insert the captured lead; returns { data: { id }, error }. */
    createLead: (input: ExposureLeadInput) =>
      db.from('exposure_leads').insert(input).select('id').single(),
  };
}
