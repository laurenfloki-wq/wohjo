// C1 — Synthetic "Bravo Labour Hire" dataset for the public /demo page.
//
// 20 workers × 4 sites × ~6 weeks of clock events. Deliberately includes
// the following edge cases (one each, tagged for UI visibility):
//   * NO_SHOW        — worker rostered, no clock events, shift stub auto-created
//   * GPS_FAIL       — shift submitted with null GPS (permission denied flow)
//   * DOUBLE_CLOCK   — two START_EVENTs for the same worker+date (sync guard trip)
//   * EDIT_REQUESTED — worker submitted an edit via /field (status=EDIT_REQUESTED)
//   * MANAGER_OVERRIDE — supervisor-adjusted start/end time via /command
//
// This dataset is intentionally NOT inserted into any live database. It
// is imported directly by the demo route components so the public
// /demo walkthrough renders through the production UI components with
// synthetic inputs. A visible banner at the top of /demo declares it
// synthetic.

export type DemoStatus =
  | 'SUBMITTED'
  | 'SUPERVISOR_APPROVED'
  | 'PAYROLL_APPROVED'
  | 'DISPUTED'
  | 'EDIT_REQUESTED'
  | 'NO_SHOW';

export type EdgeCase =
  | 'NONE'
  | 'NO_SHOW'
  | 'GPS_FAIL'
  | 'DOUBLE_CLOCK'
  | 'EDIT_REQUESTED'
  | 'MANAGER_OVERRIDE';

export interface DemoSite {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface DemoWorker {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  pay_rate: string; // decimal string
  site_id: string;  // default site assignment
}

export interface DemoShift {
  id: string;
  worker_id: string;
  worker_name: string;
  site_id: string;
  site_name: string;
  shift_date: string;         // YYYY-MM-DD
  start_time: string | null;  // ISO
  end_time: string | null;    // ISO
  break_minutes: number;
  total_hours: string;        // decimal string
  receipt_id: string;
  status: DemoStatus;
  confidence_score: number;   // 0-100
  anomaly_flags: Array<{ severity: 'HIGH' | 'MEDIUM' | 'LOW'; code: string; message: string }>;
  supervisor_note?: string;
  worker_note?: string;
  edge_case: EdgeCase;
  gps_ok: boolean;
}

export interface DemoDataset {
  company: { id: string; name: string; contact_email: string };
  sites: DemoSite[];
  workers: DemoWorker[];
  shifts: DemoShift[];
  generated_at: string;
}

// ────────────────────────────────────────────────────────────────────
// Deterministic IDs & names
// ────────────────────────────────────────────────────────────────────
function id(seed: string): string {
  // Deterministic pseudo-uuid from seed
  const s = seed + '-bravo-demo';
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const h = hash.toString(16).padStart(8, '0');
  return `${h}-${h.slice(0, 4)}-4${h.slice(1, 4)}-8${h.slice(2, 5)}-${h}${h.slice(0, 4)}`;
}

const FIRST = ['Mo', 'Joao', 'Emma', 'Ravi', 'Kai', 'Sana', 'Noah', 'Tui', 'Asha', 'Leo',
               'Priya', 'Omar', 'Chloe', 'Dev', 'Maia', 'Zane', 'Hana', 'Finn', 'Ivy', 'Quinn'];
const LAST = ['Shaaf', 'Campos', 'Wilson', 'Patel', 'Tane', 'Khan', 'Lee', 'Osman', 'Singh', 'Nguyen',
              'Rao', 'Hassan', 'Park', 'Sood', 'Brown', 'O\'Neill', 'Haruna', 'Murphy', 'Cohen', 'Te Rangi'];

// ────────────────────────────────────────────────────────────────────
// Builders
// ────────────────────────────────────────────────────────────────────
function buildSites(): DemoSite[] {
  return [
    { id: id('site-1'), name: 'Parramatta Tower Fit-out',   address: '1 Parramatta Square, Parramatta NSW', lat: -33.8148, lng: 151.0011 },
    { id: id('site-2'), name: 'Bankstown Civic Redevelopment', address: '75 Bankstown City Plaza, Bankstown NSW', lat: -33.9174, lng: 151.0349 },
    { id: id('site-3'), name: 'Port Kembla Industrial',     address: '100 Port Kembla Rd, Port Kembla NSW', lat: -34.4714, lng: 150.9050 },
    { id: id('site-4'), name: 'Western Sydney Airport Stg 2', address: 'Badgerys Creek, Bringelly NSW',        lat: -33.8800, lng: 150.7400 },
  ];
}

function buildWorkers(sites: DemoSite[]): DemoWorker[] {
  const workers: DemoWorker[] = [];
  for (let i = 0; i < 20; i++) {
    workers.push({
      id: id(`worker-${i}`),
      first_name: FIRST[i % FIRST.length],
      last_name: LAST[(i * 3) % LAST.length],
      phone: `+614${(42000000 + i).toString().padStart(8, '0')}`,
      pay_rate: '28.47',
      site_id: sites[i % sites.length].id,
    });
  }
  return workers;
}

function hoursBetween(a: Date, b: Date): string {
  const ms = b.getTime() - a.getTime();
  return (ms / 3_600_000).toFixed(2);
}

function buildShifts(workers: DemoWorker[], sites: DemoSite[]): DemoShift[] {
  const shifts: DemoShift[] = [];
  const today = new Date();
  let receiptCounter = 10_000;

  // 6 weeks × 5 weekdays × 20 workers = ~600 shifts. Cap at 600 to stay
  // lean for a demo page load.
  for (let day = 0; day < 30; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    // Skip weekends
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const shiftDate = date.toISOString().slice(0, 10);

    for (let w = 0; w < workers.length; w++) {
      const worker = workers[w];
      const site = sites.find((s) => s.id === worker.site_id)!;

      // Default shift: 07:00–15:30, 30 min break, 8.00 hours.
      const start = new Date(date); start.setHours(7, 0, 0, 0);
      const end = new Date(date);   end.setHours(15, 30, 0, 0);

      // Sprinkle edge cases — one each, latest day in the window.
      let edge: EdgeCase = 'NONE';
      let status: DemoStatus = 'PAYROLL_APPROVED';
      let startIso: string | null = start.toISOString();
      let endIso: string | null = end.toISOString();
      let gps = true;
      let anomaly: DemoShift['anomaly_flags'] = [];
      let workerNote: string | undefined;
      let supervisorNote: string | undefined;
      let confidence = 95;

      // On the most recent weekday, inject the five edge cases on first five workers.
      if (day === 0) {
        if (w === 0) {
          edge = 'NO_SHOW';
          status = 'NO_SHOW';
          startIso = null;
          endIso = null;
          anomaly = [{ severity: 'HIGH', code: 'NO_SHOW', message: 'Rostered but no clock events received.' }];
          confidence = 0;
        } else if (w === 1) {
          edge = 'GPS_FAIL';
          status = 'SUBMITTED';
          gps = false;
          anomaly = [{ severity: 'MEDIUM', code: 'GPS_UNAVAILABLE', message: 'Worker submitted manually; location permission was denied.' }];
          workerNote = 'Phone wouldn\'t share location; arrived on-time per supervisor.';
          confidence = 60;
        } else if (w === 2) {
          edge = 'DOUBLE_CLOCK';
          status = 'SUBMITTED';
          anomaly = [{ severity: 'HIGH', code: 'DUPLICATE_START', message: 'Two START_EVENTs for the same date — sync-guard triggered, second call ignored.' }];
          confidence = 40;
        } else if (w === 3) {
          edge = 'EDIT_REQUESTED';
          status = 'EDIT_REQUESTED';
          workerNote = 'Break was actually 45 minutes, not 30.';
          anomaly = [{ severity: 'LOW', code: 'WORKER_EDIT_PENDING', message: 'Worker requested a break-minutes correction; awaiting supervisor review.' }];
          confidence = 75;
        } else if (w === 4) {
          edge = 'MANAGER_OVERRIDE';
          status = 'SUPERVISOR_APPROVED';
          // Manager adjusted start 7:15 instead of 7:00.
          const overrideStart = new Date(date); overrideStart.setHours(7, 15, 0, 0);
          startIso = overrideStart.toISOString();
          supervisorNote = 'Adjusted start to 07:15 — worker arrived late due to traffic on M4.';
          anomaly = [{ severity: 'LOW', code: 'SUPERVISOR_ADJUSTED', message: 'Supervisor edited start time from 07:00 to 07:15.' }];
          confidence = 90;
        }
      }

      const totalHours =
        startIso && endIso
          ? hoursBetween(new Date(startIso), new Date(endIso))
          : '0.00';

      shifts.push({
        id: id(`shift-${w}-${day}`),
        worker_id: worker.id,
        worker_name: `${worker.first_name} ${worker.last_name}`,
        site_id: site.id,
        site_name: site.name,
        shift_date: shiftDate,
        start_time: startIso,
        end_time: endIso,
        break_minutes: edge === 'EDIT_REQUESTED' ? 45 : 30,
        total_hours: totalHours,
        receipt_id: `FSTR-${String(receiptCounter++).padStart(6, '0')}`,
        status,
        confidence_score: confidence,
        anomaly_flags: anomaly,
        supervisor_note: supervisorNote,
        worker_note: workerNote,
        edge_case: edge,
        gps_ok: gps,
      });
    }
  }
  return shifts;
}

let cached: DemoDataset | null = null;

export function getBravoDataset(): DemoDataset {
  if (cached) return cached;
  const sites = buildSites();
  const workers = buildWorkers(sites);
  const shifts = buildShifts(workers, sites);
  cached = {
    company: { id: id('bravo-company'), name: 'Bravo Labour Hire (DEMO)', contact_email: 'payroll+demo@bravo-labour.test' },
    sites,
    workers,
    shifts,
    generated_at: new Date().toISOString(),
  };
  return cached;
}
