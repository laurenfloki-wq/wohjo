// Cross-tenant test fixtures: Acme Labour Hire + Bravo Labour Hire.
// Deterministic UUIDs + phone numbers so tests can assert against
// specific rows without re-generating keys per run.
//
// Worker/shift counts match the mission brief: 15 workers × 3 sites ×
// ~50 shifts per tenant.

import { randomUUID, createHash } from 'crypto';

export type Tenant = 'acme' | 'bravo';

export interface CompanyFixture {
  id: string;
  name: string;
  contact_email: string;
  tenant: Tenant;
  marker: string;
}

export interface SiteFixture {
  id: string;
  company_id: string;
  name: string;
  lat: number;
  lng: number;
  tenant: Tenant;
}

export interface WorkerFixture {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  pay_rate: string;
  tenant: Tenant;
}

export interface SupervisorFixture {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  verify_token: string;
  is_active: boolean;
  pending_sms_approval_ids: string[];
  tenant: Tenant;
}

export interface ShiftFixture {
  id: string;
  company_id: string;
  worker_id: string;
  site_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_hours: string;
  receipt_id: string;
  status: 'SUBMITTED' | 'SUPERVISOR_APPROVED' | 'PAYROLL_APPROVED' | 'EXPORTED';
  tenant: Tenant;
}

export interface TenantFixture {
  company: CompanyFixture;
  sites: SiteFixture[];
  workers: WorkerFixture[];
  supervisors: SupervisorFixture[];
  shifts: ShiftFixture[];
}

// Deterministic UUID generator — seeds from a string so Acme/Bravo
// always produce the same ids across test runs.
function deterministicUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  // format as a v4-shaped uuid (with the seed hash as raw content)
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    '4' + h.slice(13, 16),
    '8' + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

export function buildTenant(t: Tenant): TenantFixture {
  const marker = t === 'acme' ? '_ACME_A3_TEST' : '_BRAVO_A3_TEST';
  const company: CompanyFixture = {
    id: deterministicUuid(`${t}:company`),
    name: t === 'acme' ? 'Acme Labour Hire (A3 test)' : 'Bravo Labour Hire (A3 test)',
    contact_email: `payroll+${t}-a3@example.test`,
    tenant: t,
    marker,
  };

  const sites: SiteFixture[] = [];
  for (let i = 0; i < 3; i++) {
    sites.push({
      id: deterministicUuid(`${t}:site:${i}`),
      company_id: company.id,
      name: `${company.name} site ${i + 1}`,
      lat: -35.37 + i * 0.01, // Canberra-ish
      lng: 149.19 + i * 0.01,
      tenant: t,
    });
  }

  const workers: WorkerFixture[] = [];
  for (let i = 0; i < 15; i++) {
    const phoneBase = t === 'acme' ? 42000000 : 43000000;
    workers.push({
      id: deterministicUuid(`${t}:worker:${i}`),
      company_id: company.id,
      first_name: `Worker${i + 1}`,
      last_name: t === 'acme' ? 'Acme' : 'Bravo',
      phone: `+61${phoneBase + i}`,
      pay_rate: '28.47',
      tenant: t,
    });
  }

  const supervisors: SupervisorFixture[] = [];
  for (let i = 0; i < 2; i++) {
    supervisors.push({
      id: deterministicUuid(`${t}:supervisor:${i}`),
      company_id: company.id,
      name: `Supervisor${i + 1} ${t.toUpperCase()}`,
      phone: t === 'acme' ? `+61444100${10 + i}` : `+61444200${10 + i}`,
      verify_token: deterministicUuid(`${t}:token:${i}`).replace(/-/g, '').slice(0, 32),
      is_active: true,
      pending_sms_approval_ids: [],
      tenant: t,
    });
  }

  const shifts: ShiftFixture[] = [];
  // Roughly 50 shifts per worker spread over the previous 6 weeks.
  let shiftCounter = 0;
  for (let w = 0; w < workers.length; w++) {
    for (let d = 0; d < 50; d++) {
      const dayOffset = d * -1; // d days back
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      const shiftDate = date.toISOString().slice(0, 10);
      const start = new Date(date);
      start.setHours(7, 0, 0, 0);
      const end = new Date(date);
      end.setHours(15, 30, 0, 0);
      const shift_id = deterministicUuid(`${t}:shift:${w}:${d}`);
      shifts.push({
        id: shift_id,
        company_id: company.id,
        worker_id: workers[w].id,
        site_id: sites[d % 3].id,
        shift_date: shiftDate,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        break_minutes: 30,
        total_hours: '8.00',
        receipt_id: `FSTR-${t.toUpperCase()}-${String(shiftCounter++).padStart(6, '0')}`,
        status: 'SUPERVISOR_APPROVED',
        tenant: t,
      });
    }
  }

  return { company, sites, workers, supervisors, shifts };
}

/**
 * Utility used by live-run cleanup to remove every fixture row by marker.
 * We tag every inserted row (via `created_by` or a marker column) with
 * `_<TENANT>_A3_TEST` so live cleanup is one DELETE per table.
 */
export function fixtureMarker(tenant: Tenant): string {
  return tenant === 'acme' ? '_ACME_A3_TEST' : '_BRAVO_A3_TEST';
}
