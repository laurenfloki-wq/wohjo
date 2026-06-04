'use client';

// CRACK 232 — bulk worker CSV upload UI.
//
// Three-phase UX:
//   1. Pick — drag-drop or file-input picks a CSV; on pick, parse
//      client-side via the same helpers as the route so the admin
//      sees errors BEFORE submitting.
//   2. Preview — show the rows that will be uploaded + any errors.
//      "Upload N workers" button is disabled if any errors.
//   3. Result — green success card with the created workers, or red
//      error card with failed_rows from the server.
//
// All actual writes happen via POST /api/admin/workers/bulk-upload.
// The page is purely admin-side, server-derived company_id.

import { useCallback, useRef, useState } from 'react';
import CommandNav from '@/components/command/CommandNav';
import { parseBulkWorkerCsv, type ParsedWorker, type RowError } from '@/lib/bulk-worker-csv';

type Phase = 'pick' | 'preview' | 'submitting' | 'result';

interface CreatedWorker {
  worker_id: string;
  employee_id: string;
  phone: string;
}

interface ServerResult {
  created_count: number;
  created_workers?: CreatedWorker[];
  failed_rows?: RowError[];
  error?: string;
  message?: string;
}

const SAMPLE_CSV = [
  'employee_id,full_name,mobile_e164,myob_card_id',
  'EMP-001,Joao Muniz Campos,+61400000001,*0001',
  'EMP-002,Maria Garcia,+61400000002,',
  'EMP-003,John Smith,+61400000003,*0003',
].join('\n');

export default function BulkWorkerUploadPage() {
  const [phase, setPhase] = useState<Phase>('pick');
  const [filename, setFilename] = useState<string>('');
  const [parsed, setParsed] = useState<{ rows: ParsedWorker[]; errors: RowError[] }>({
    rows: [],
    errors: [],
  });
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFile = useCallback(async (file: File) => {
    setFilename(file.name);
    const text = await file.text();
    const result = parseBulkWorkerCsv(text);
    setParsed(result);
    setPhase('preview');
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void onFile(file);
    },
    [onFile],
  );

  const onPickClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onPickChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void onFile(file);
    },
    [onFile],
  );

  const resetToPick = useCallback(() => {
    setPhase('pick');
    setParsed({ rows: [], errors: [] });
    setServerResult(null);
    setFilename('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  async function submitUpload() {
    if (parsed.errors.length > 0 || parsed.rows.length === 0) return;
    setPhase('submitting');

    // Rebuild CSV from parsed rows so any blank-line / BOM noise from
    // the original file is stripped before the wire.
    const csvLines = ['employee_id,full_name,mobile_e164,myob_card_id'];
    for (const r of parsed.rows) {
      const fullName = `${r.first_name} ${r.last_name === '-' ? '' : r.last_name}`.trim();
      csvLines.push([r.employee_id, fullName, r.phone, r.myob_card_id ?? ''].join(','));
    }
    const csv = csvLines.join('\n');

    try {
      const res = await fetch('/api/admin/workers/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = (await res.json().catch(() => ({}))) as ServerResult;
      setServerResult(data);
      setPhase('result');
    } catch (err) {
      setServerResult({
        created_count: 0,
        error: err instanceof Error ? err.message : 'Network error',
      });
      setPhase('result');
    }
  }

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <Header />

        {phase === 'pick' && (
          <DropZone
            dragOver={dragOver}
            onDragEnter={() => setDragOver(true)}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onPickClick={onPickClick}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose a worker CSV file to upload"
          style={{ display: 'none' }}
          onChange={onPickChange}
        />

        {phase === 'pick' && <SampleCsv csv={SAMPLE_CSV} />}

        {(phase === 'preview' || phase === 'submitting') && (
          <PreviewCard
            filename={filename}
            parsed={parsed}
            submitting={phase === 'submitting'}
            onSubmit={submitUpload}
            onCancel={resetToPick}
          />
        )}

        {phase === 'result' && serverResult && (
          <ResultCard result={serverResult} onReset={resetToPick} />
        )}
      </div>
    </>
  );
}

// ─── Header ────────────────────────────────────────────────────────
function Header() {
  return (
    <div style={{ marginBottom: 32 }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary)',
          marginBottom: 8,
        }}
      >
        Command · Workers
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          fontWeight: 700,
          margin: 0,
          color: 'var(--color-text-primary)',
          letterSpacing: '-0.012em',
          lineHeight: 1.05,
        }}
      >
        Bulk upload workers
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--color-text-tertiary)',
          marginTop: 8,
          fontFamily: 'var(--font-sans)',
          maxWidth: 640,
        }}
      >
        Upload a CSV with one row per worker. The upload is atomic — if any row has an error, no
        workers are created. Workers receive no SMS invite from this flow; they sign in via
        phone-OTP when they first open the field app.
      </p>
    </div>
  );
}

// ─── Drop zone ─────────────────────────────────────────────────────
function DropZone(props: {
  dragOver: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onPickClick: () => void;
}) {
  return (
    <div
      data-testid="bulk-upload-dropzone"
      onClick={props.onPickClick}
      onDragOver={(e) => {
        e.preventDefault();
        props.onDragEnter();
      }}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      style={{
        background: props.dragOver ? 'rgba(245, 242, 234, 0.06)' : 'var(--color-bg-secondary)',
        border: `2px dashed ${props.dragOver ? 'var(--color-amber)' : 'var(--color-border-strong)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '64px 32px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: 8,
        }}
      >
        Drop your CSV here, or click to pick
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Header: <code>employee_id,full_name,mobile_e164,myob_card_id</code> — max 10,000 rows
      </div>
    </div>
  );
}

// ─── Sample CSV block ──────────────────────────────────────────────
function SampleCsv({ csv }: { csv: string }) {
  return (
    <div
      style={{
        marginTop: 28,
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.16em',
          color: 'var(--color-text-secondary)',
          marginBottom: 12,
          textTransform: 'uppercase',
        }}
      >
        Sample CSV
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--color-text-primary)',
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      >
        {csv}
      </pre>
    </div>
  );
}

// ─── Preview card ──────────────────────────────────────────────────
function PreviewCard(props: {
  filename: string;
  parsed: { rows: ParsedWorker[]; errors: RowError[] };
  submitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { rows, errors } = props.parsed;
  const canSubmit = errors.length === 0 && rows.length > 0 && !props.submitting;

  return (
    <div
      data-testid="bulk-upload-preview"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 28,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 18,
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.005em',
          }}
        >
          Preview: {props.filename}
        </h2>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {rows.length} row{rows.length !== 1 ? 's' : ''} · {errors.length} error
          {errors.length !== 1 ? 's' : ''}
        </div>
      </div>

      {errors.length > 0 && (
        <div
          style={{
            marginBottom: 18,
            padding: '14px 16px',
            background: 'rgba(199, 75, 58, 0.12)',
            border: '1px solid rgba(199, 75, 58, 0.35)',
            borderRadius: 'var(--radius-btn)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: '#F8D7CE',
          }}
          data-testid="bulk-upload-errors"
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Fix these {errors.length} error{errors.length !== 1 ? 's' : ''} and re-upload — no
            workers will be created until the CSV is clean.
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {errors.slice(0, 20).map((e, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <strong>Row {e.row}:</strong> {e.error}
              </li>
            ))}
            {errors.length > 20 && (
              <li style={{ marginTop: 6, opacity: 0.7 }}>…and {errors.length - 20} more.</li>
            )}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 18 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Row', 'Employee ID', 'Name', 'Mobile', 'MYOB Card ID'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      fontWeight: 600,
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r) => (
                <tr key={r.row_index} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>
                    {r.row_index}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-primary)' }}>
                    {r.employee_id}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-primary)' }}>
                    {r.first_name} {r.last_name === '-' ? '' : r.last_name}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>
                    {r.phone}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>
                    {r.myob_card_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--color-text-tertiary)',
                marginTop: 10,
                fontFamily: 'var(--font-sans)',
              }}
            >
              …and {rows.length - 50} more. (All {rows.length} will be uploaded.)
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          data-testid="bulk-upload-submit"
          onClick={props.onSubmit}
          disabled={!canSubmit}
          style={{
            padding: '12px 26px',
            background: canSubmit ? 'var(--color-amber)' : 'var(--color-text-tertiary)',
            color: '#0F0F10',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {props.submitting
            ? 'Uploading…'
            : `Upload ${rows.length} worker${rows.length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={props.onCancel}
          style={{
            padding: '12px 22px',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-btn)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Result card ───────────────────────────────────────────────────
function ResultCard({ result, onReset }: { result: ServerResult; onReset: () => void }) {
  const isSuccess = result.created_count > 0 && !result.error;
  const failedRows = result.failed_rows ?? [];

  return (
    <div
      data-testid="bulk-upload-result"
      data-variant={isSuccess ? 'success' : 'error'}
      style={{
        background: 'var(--color-bg-secondary)',
        border: `1px solid ${isSuccess ? 'var(--color-green)' : 'var(--color-warm-red)'}`,
        borderRadius: 'var(--radius-card)',
        padding: 28,
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 600,
          margin: 0,
          marginBottom: 12,
          color: isSuccess ? 'var(--color-green)' : 'var(--color-warm-red)',
          letterSpacing: '-0.005em',
        }}
      >
        {isSuccess
          ? `Created ${result.created_count} worker${result.created_count !== 1 ? 's' : ''}`
          : 'Upload failed — no workers created'}
      </h2>

      {!isSuccess && (
        <div
          style={{
            marginBottom: 14,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--color-text-secondary)',
          }}
        >
          {result.error ?? result.message ?? 'Unknown error.'}
        </div>
      )}

      {failedRows.length > 0 && (
        <ul
          style={{
            margin: '0 0 16px',
            paddingLeft: 18,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: '#F8D7CE',
          }}
        >
          {failedRows.map((e, i) => (
            <li key={i}>
              <strong>Row {e.row}:</strong> {e.error}
            </li>
          ))}
        </ul>
      )}

      {isSuccess && result.created_workers && (
        <div
          style={{
            marginBottom: 16,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          The new workers can now sign into the field app by phone-OTP. They do not receive an SMS
          from this flow.
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onReset}
          style={{
            padding: '12px 22px',
            background: 'var(--color-amber)',
            color: '#0F0F10',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 'var(--radius-btn)',
            cursor: 'pointer',
          }}
        >
          {isSuccess ? 'Upload another' : 'Try again'}
        </button>
        <a
          href="/command/workers"
          style={{
            padding: '12px 22px',
            background: 'transparent',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-btn)',
            textDecoration: 'none',
          }}
        >
          See all workers
        </a>
      </div>
    </div>
  );
}
