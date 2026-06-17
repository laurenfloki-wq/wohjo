'use client';

// Operator "Verify a pack" tool. Paste a file hash or a full verify URL
// (from any Evidence Pack PDF footer, the verify page, or the payroll
// file's X-Payroll-File-Hash / X-Verify-URL header) and re-check the
// hours against the live ledger. It calls the SAME public endpoint the
// QR and payroll integrations use — the operator sees exactly what an
// auditor would.

import { useState } from 'react';
import { parseVerifyToken } from '@/lib/audit/verify-url';

interface VerifyShift {
  receipt_id: string;
  worker_name: string;
  date: string;
  hours: number;
  chain: 'VERIFIED' | 'BROKEN';
}
interface VerifyJson {
  status: 'VERIFIED' | 'BROKEN';
  verified_at: string;
  pay_period: { start: string; end: string };
  provider: string | null;
  file_hash: string;
  totals: { shifts: number; hours: number; events: number };
  shifts: VerifyShift[];
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: VerifyJson }
  | { kind: 'notfound' }
  | { kind: 'error'; message: string };

export default function VerifyTool() {
  const [input, setInput] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  const token = parseVerifyToken(input);
  const ready = token !== null;

  async function check() {
    if (!token) return;
    setOutcome({ kind: 'loading' });
    try {
      const res = await fetch(`/verify/${token}?format=json`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.status === 404) {
        setOutcome({ kind: 'notfound' });
        return;
      }
      if (!res.ok) {
        setOutcome({ kind: 'error', message: `Verification service returned ${res.status}.` });
        return;
      }
      const data = (await res.json()) as VerifyJson;
      setOutcome({ kind: 'ok', data });
    } catch {
      setOutcome({ kind: 'error', message: 'Could not reach the verification service.' });
    }
  }

  return (
    <section className="sect" aria-label="Verify a pack">
      <div className="vtool">
        <label htmlFor="vt-input" className="vlabel">
          File hash or verify link
        </label>
        <div className="vrow">
          <input
            id="vt-input"
            className="vinput"
            placeholder="Paste a 64-character file hash or a https://…/verify/… link"
            value={input}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready) check();
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={!ready || outcome.kind === 'loading'}
            onClick={check}
          >
            {outcome.kind === 'loading' ? 'Checking…' : 'Check'}
          </button>
        </div>
        {input.trim() !== '' && !ready ? (
          <p className="vhint">
            That doesn&rsquo;t look like a file hash. Paste the 64-character SHA-256 from the pack
            footer, or the full verify link.
          </p>
        ) : (
          <p className="vhint">
            Re-checks the hours against the live WLES ledger — the same check an auditor sees.
          </p>
        )}
      </div>

      {outcome.kind === 'notfound' ? (
        <div className="vresult bad">
          <div className="vverdict">No matching record</div>
          <p>
            No record issued by Flostruction matches this code. The document may have been altered,
            or it was not produced here.
          </p>
        </div>
      ) : null}

      {outcome.kind === 'error' ? (
        <div className="vresult warn">
          <div className="vverdict">Couldn&rsquo;t check just now</div>
          <p>{outcome.message}</p>
        </div>
      ) : null}

      {outcome.kind === 'ok' ? (
        <div className={`vresult ${outcome.data.status === 'VERIFIED' ? 'ok' : 'bad'}`}>
          <div className="vverdict">
            <span className="vdot" />
            {outcome.data.status === 'VERIFIED' ? 'Verified' : 'Failed verification'}
          </div>
          <p className="vsummary">
            {outcome.data.totals.hours.toFixed(2)} verified hours · {outcome.data.totals.shifts}{' '}
            {outcome.data.totals.shifts === 1 ? 'shift' : 'shifts'} ·{' '}
            {outcome.data.pay_period.start}
            {outcome.data.pay_period.start !== outcome.data.pay_period.end
              ? ` – ${outcome.data.pay_period.end}`
              : ''}
            {outcome.data.provider ? ` · ${outcome.data.provider}` : ''}
          </p>
          <div className="vshifts">
            {outcome.data.shifts.map((s) => (
              <div className="vshift" key={s.receipt_id}>
                <span className={`vmark ${s.chain === 'VERIFIED' ? 'g' : 'r'}`} />
                <span className="vname">{s.worker_name}</span>
                <span className="vdate">{s.date}</span>
                <span className="vhours">{s.hours.toFixed(2)}</span>
                <code className="vreceipt">{s.receipt_id}</code>
              </div>
            ))}
          </div>
          <p className="vfoot">
            Re-checked against the ledger just now. File SHA-256{' '}
            <code className="vhash">{outcome.data.file_hash}</code>
          </p>
        </div>
      ) : null}
    </section>
  );
}
