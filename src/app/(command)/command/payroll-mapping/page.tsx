// /command/payroll-mapping — MYOB activity mapping + worker card ID
// assignment surface for the calling tenant.
//
// Functional dropdown standard ONLY (per MYOB exporter brief):
//   - Two stacked tables: Activity Mappings + Worker Card IDs
//   - Each row has a text input (no drag-to-map polish)
//   - Save buttons trigger the /api/command/payroll-mapping or
//     /api/command/worker-card-ids POST per row
//   - No bulk-save, no auto-save, no optimistic UI
//
// Drag-to-map polish is Week 3, NOT in this scope.

'use client';

import { useEffect, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';

interface ActivityMapping {
  flostruction_category: string;
  myob_activity_id: string;
  updated_at: string | null;
}

interface WorkerCardRow {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  myob_card_id: string | null;
  is_active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  ordinary_hours: 'Ordinary hours',
  overtime_1_5x: 'Overtime 1.5×',
  overtime_2x: 'Overtime 2×',
  rdo_deductions_cw2: 'RDO deductions (CW2)',
  travel_allowance: 'Travel allowance',
  meal_allowance: 'Meal allowance',
  inclement_weather_cw2: 'Inclement weather (CW2)',
  multi_storey_allowance: 'Multi-storey allowance',
};

function formatLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export default function PayrollMappingPage() {
  const [mappings, setMappings] = useState<ActivityMapping[]>([]);
  const [workers, setWorkers] = useState<WorkerCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMapping, setSavingMapping] = useState<string | null>(null);
  const [savingWorker, setSavingWorker] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [mRes, wRes] = await Promise.all([
        fetch('/api/command/payroll-mapping'),
        fetch('/api/command/worker-card-ids'),
      ]);
      if (!mRes.ok) throw new Error(`mappings: ${mRes.status}`);
      if (!wRes.ok) throw new Error(`workers: ${wRes.status}`);
      const mJson = (await mRes.json()) as { mappings: ActivityMapping[] };
      const wJson = (await wRes.json()) as { workers: WorkerCardRow[] };
      setMappings(mJson.mappings);
      setWorkers(wJson.workers);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `Could not load: ${err.message}`
          : 'Could not load payroll mapping data',
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveMapping(category: string, value: string) {
    setSavingMapping(category);
    setErrorMsg('');
    try {
      const res = await fetch('/api/command/payroll-mapping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          flostruction_category: category,
          myob_activity_id: value.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `${res.status}`);
      }
      // Optimistic local update — refetch on every save to keep
      // the timestamp accurate.
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? `Save failed: ${err.message}` : 'Save failed',
      );
    } finally {
      setSavingMapping(null);
    }
  }

  async function saveWorkerCard(workerId: string, value: string) {
    setSavingWorker(workerId);
    setErrorMsg('');
    try {
      const res = await fetch('/api/command/worker-card-ids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          worker_id: workerId,
          myob_card_id: value.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `${res.status}`);
      }
      await loadAll();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? `Save failed: ${err.message}` : 'Save failed',
      );
    } finally {
      setSavingWorker(null);
    }
  }

  return (
    <div className="command-dark" style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>
      <CommandNav />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
            }}
          >
            Command / payroll mapping
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              margin: '8px 0 0',
            }}
          >
            MYOB AccountRight setup
          </h1>
          <p
            style={{
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              marginTop: 12,
              maxWidth: 640,
            }}
          >
            Map each FLOSTRUCTION category to your MYOB Activity ID, and
            assign your workers&rsquo; MYOB Card IDs. Both are required
            before you can run a MYOB export.
          </p>
        </div>

        {errorMsg && (
          <div
            data-testid="payroll-mapping-error"
            style={{
              background: 'rgba(199, 75, 58, 0.12)',
              color: '#C74B3A',
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 24,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ─── Activity mappings table ─── */}
        <section style={{ marginBottom: 48 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              marginBottom: 16,
            }}
          >
            Activity mappings
          </h2>
          {loading ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading&hellip;</p>
          ) : (
            <table data-testid="activity-mappings-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    FLOSTRUCTION category
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    MYOB Activity ID
                  </th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <MappingRow
                    key={m.flostruction_category}
                    mapping={m}
                    saving={savingMapping === m.flostruction_category}
                    onSave={(v) => saveMapping(m.flostruction_category, v)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── Worker card IDs table ─── */}
        <section>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              marginBottom: 16,
            }}
          >
            Worker MYOB Card IDs
          </h2>
          {loading ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>Loading&hellip;</p>
          ) : workers.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)' }}>No active workers in your tenant yet.</p>
          ) : (
            <table data-testid="worker-card-ids-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    Worker
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    Employee ID
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                    MYOB Card ID
                  </th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <WorkerRow
                    key={w.id}
                    worker={w}
                    saving={savingWorker === w.id}
                    onSave={(v) => saveWorkerCard(w.id, v)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

function MappingRow({
  mapping,
  saving,
  onSave,
}: {
  mapping: ActivityMapping;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(mapping.myob_activity_id);
  const dirty = value.trim() !== mapping.myob_activity_id;
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={{ padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14 }}>
        {formatLabel(mapping.flostruction_category)}
      </td>
      <td style={{ padding: '12px' }}>
        <input
          data-testid={`mapping-input-${mapping.flostruction_category}`}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. CW2-ORD"
          maxLength={64}
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 4,
            width: '100%',
            maxWidth: 220,
          }}
        />
      </td>
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <button
          data-testid={`mapping-save-${mapping.flostruction_category}`}
          disabled={saving || !dirty}
          onClick={() => onSave(value)}
          style={{
            background: dirty ? '#D9A548' : 'transparent',
            color: dirty ? '#0F0F10' : 'var(--color-text-secondary)',
            border: dirty ? 'none' : '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 4,
            cursor: saving ? 'wait' : dirty ? 'pointer' : 'default',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
        </button>
      </td>
    </tr>
  );
}

function WorkerRow({
  worker,
  saving,
  onSave,
}: {
  worker: WorkerCardRow;
  saving: boolean;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(worker.myob_card_id ?? '');
  const dirty = value.trim() !== (worker.myob_card_id ?? '');
  return (
    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
      <td style={{ padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14 }}>
        {worker.first_name} {worker.last_name}
      </td>
      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        {worker.employee_id}
      </td>
      <td style={{ padding: '12px' }}>
        <input
          data-testid={`worker-card-input-${worker.id}`}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. *0001"
          maxLength={64}
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 4,
            width: '100%',
            maxWidth: 220,
          }}
        />
      </td>
      <td style={{ padding: '12px', textAlign: 'right' }}>
        <button
          data-testid={`worker-card-save-${worker.id}`}
          disabled={saving || !dirty}
          onClick={() => onSave(value)}
          style={{
            background: dirty ? '#D9A548' : 'transparent',
            color: dirty ? '#0F0F10' : 'var(--color-text-secondary)',
            border: dirty ? 'none' : '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 4,
            cursor: saving ? 'wait' : dirty ? 'pointer' : 'default',
            fontWeight: 600,
          }}
        >
          {saving ? 'Saving' : dirty ? 'Save' : 'Saved'}
        </button>
      </td>
    </tr>
  );
}
