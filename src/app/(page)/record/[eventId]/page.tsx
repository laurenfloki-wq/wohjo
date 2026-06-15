// Record evidence viewer — a sealed record is read-only by nature, but
// not inert. Full hash + the previous hash it chains to, the canonical
// payload, an independent recompute, and links to the worker it concerns.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { recordRepo } from '@/lib/db/repositories/page.repo';
import { evidenceVerdict, receiptOf, type RecordEventRow } from '@/lib/record/evidence';
import { sydneyDateLabel, sydneyTime } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';

export const dynamic = 'force-dynamic';

interface FullEventRow extends RecordEventRow {
  spec_version: string | null;
  created_by: string | null;
}

function plainType(t: string): string {
  return t.replace(/^X-FLOSMOSIS-/, 'system ').replace(/_/g, ' ').toLowerCase();
}

export default async function RecordEvidencePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const log = routeLogger('GET /record/:id', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'record.detail.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">A sealed record needs a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">Sign in</a>
        </div>
      </main>
    );
  }

  const { eventId } = await params;
  const { data } = await recordRepo(companyId).eventById(eventId);
  if (!data) {
    return (
      <main>
        <div className="greet">
          <div className="day">
            <Link href="/record">The record</Link> · evidence
          </div>
          <h1>That record isn’t on your chain.</h1>
          <p className="sub">
            It may be from another company, or the link is stale.{' '}
            <Link href="/record">Back to The record</Link>.
          </p>
        </div>
      </main>
    );
  }
  const e = data as unknown as FullEventRow;
  const receipt = receiptOf(e.event_data);
  const verdict = evidenceVerdict(e);
  const payload = JSON.stringify(e.event_data ?? {}, null, 2);

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">
          <Link href="/record">The record</Link> · evidence
        </div>
        <h1>{receipt ?? plainType(e.event_type)}</h1>
        <p className="sub">
          {plainType(e.event_type)} · {sydneyDateLabel(new Date(e.created_at))}{' '}
          {sydneyTime(e.created_at)} · spec {e.spec_version ?? '0'}.
        </p>
      </div>

      <p className={verdict.matches ? 'run-note' : 'run-note gen'}>
        {verdict.matches ? (
          <>
            Independently verified — recomputing the hash from the stored payload reproduces it
            exactly. <span className="fp">the mathematics doesn’t need us.</span>
          </>
        ) : (
          <>
            This record uses a typed hash scheme; its place in the chain is verified by the daily{' '}
            <Link href="/record">anchors</Link>, not the generic recompute.
          </>
        )}
      </p>

      <section className="sect" aria-label="Hashes">
        <h2 className="label">Chain of trust</h2>
        <div className="hashrow">
          <span className="k">This record’s hash</span>
          <code className="hashfull">{e.event_hash ?? '—'}</code>
        </div>
        <div className="hashrow">
          <span className="k">Chains to (previous)</span>
          <code className="hashfull">{e.previous_event_hash ?? 'genesis — first in the chain'}</code>
        </div>
        <div className="hashrow">
          <span className="k">Recomputed now</span>
          <code className="hashfull">{verdict.recomputed}</code>
        </div>
      </section>

      <section className="sect" aria-label="Canonical payload">
        <h2 className="label">Canonical payload</h2>
        <pre className="payload">{payload}</pre>
      </section>

      <section className="sect" aria-label="Concerns">
        <h2 className="label">Concerns</h2>
        <div className="h-row">
          <span className="tick" />
          <p>
            {e.worker_id !== null ? (
              <>
                Worker record — <Link href={`/people/${e.worker_id}`}>open the worker</Link>.
              </>
            ) : (
              'No worker is attached to this record.'
            )}
          </p>
          <span className="ref">{receipt ?? '—'}</span>
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
