'use client';

// Operator "Verify a pack" tool. Paste the receipt code (FSTR-…) printed
// on any pack — the human-sized identifier — or a file hash / verify
// link. It re-checks the hours against the live ledger via the authed,
// company-scoped lookup, so the receipt code resolves to the run it
// belongs to. The operator sees the same verdict an auditor or payroll
// system gets.

import { useState } from 'react';
import { classifyVerifyQuery } from '@/lib/audit/verify-url';

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

  const ready = classifyVerifyQuery(input) !== null;

  async function check() {
    if (!ready) return;
    setOutcome({ kind: 'loading' });
    try {
      const res = await fetch(`/api/command/payruns/verify?q=${encodeURIComponent(input.trim())}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (res.status === 404 || res.status === 400) {
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
          Receipt code or file hash
        </label>
        <div className="vrow">
          <input
            id="vt-input"
            className="vinput"
            placeholder="e.g. FSTR-C3LMPJYS"
            value={input}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
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
            That doesn&rsquo;t look like a receipt code. It starts with{' '}
            <code className="vhash">FSTR-</code> and is on every pack — the Receipt column of the
            Evidence Pack, or the receipt shown on a record.
          </p>
        ) : (
          <p className="vhint">
            Paste the receipt code from any pack (the <code className="vhash">FSTR-…</code> code).
            Re-checks the hours against the live WLES ledger — the same check an auditor sees.
          </p>
        )}
      </div>

      {outcome.kind === 'notfound' ? (
        <div className="vresult bad">
          <div className="vverdict">No matching record</div>
          <p>
            No record in your account matches that code. Check the receipt is typed correctly — or
            the pack may not have been produced here.
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
