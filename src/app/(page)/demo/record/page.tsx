// The record — demo (synthetic, demo canon only). Spec SS6: Ask at the
// top (arrives Phase 3); recent records with truncated hashes; Anchors
// including the 4 June cutover.

import { brandLine } from '@/lib/page/flags';

const RECORDS = [
  { ref: 'FSTR-0012', what: 'Demo Worker · 7.50 h · sealed', hash: 'e3b0c4…7852b855' },
  { ref: 'FSTR-0011', what: 'P. Rigger · 8.00 h · sealed', hash: '9f86d0…00a08' },
  { ref: 'FSTR-0010', what: 'A. Carpenter · 7.75 h · sealed', hash: '2c26b4…9d2d2' },
] as const;

export default function RecordDemoPage() {
  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
        <span className="mono" role="note">
          demo page · synthetic records · Demo Labour Hire Pty Ltd
        </span>
        <span className="chaintext mono">chain verified · 96/96</span>
      </div>
      <div className="greet">
        <div className="day">The record · demo</div>
        <h1>Verify any record independently — the mathematics doesn’t need us.</h1>
        <p className="sub">
          Every event is hashed and chained. Ask arrives with Phase 3 — read-only, every answer
          grounded in rows it can cite.
        </p>
      </div>

      <section className="sect" aria-label="Recent records">
        <h2 className="label">Recent records</h2>
        {RECORDS.map((r) => (
          <div className="h-row" key={r.ref}>
            <span className="tick" />
            <p>
              <b>{r.ref}</b> — {r.what}
            </p>
            <span className="ref">{r.hash}</span>
          </div>
        ))}
      </section>

      <section className="sect" aria-label="Anchors">
        <h2 className="label">Anchors</h2>
        <div className="h-row">
          <span className="tick" />
          <p>
            <b>FROZEN_ANCHOR_V0</b> — 32 pre-cutover events frozen at the 4 June cutover; recomputed
            daily, matches every day since.
          </p>
          <span className="ref">8e6d4a…f9205</span>
        </div>
      </section>

      <div className="archive">
        <div className="line">The chain is public arithmetic. Anyone can check it. That is the point.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
