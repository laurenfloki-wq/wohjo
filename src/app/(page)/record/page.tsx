// The record — live. Recent records with truncated hashes; Anchors
// including the 4 June cutover. "Verify any record independently —
// the mathematics doesn't need us."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { anchorVerification, recordRepo } from '@/lib/db/repositories/page.repo';
import { sydneyDateLabel, sydneyTime, type AnchorRow } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';

export const dynamic = 'force-dynamic';

interface EventRow {
  id: string;
  event_type: string;
  created_at: string;
  event_data: Record<string, unknown> | null;
  event_hash: string | null;
  spec_version: string | null;
  worker_id: string | null;
}

function shortHash(h: string | null): string {
  if (h === null || h.length < 12) return '—';
  return `${h.slice(0, 6)}…${h.slice(-6)}`;
}

function plainType(t: string): string {
  return t.replace(/^X-FLOSMOSIS-/, 'system ').replace(/_/g, ' ').toLowerCase();
}

export default async function RecordPage() {
  const log = routeLogger('GET /record', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'record.auth_failed');
    } else {
      log.error({ err }, 'record.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">
          The record is your company&rsquo;s sealed events and needs a signed-in operator.{' '}
          <a href="/command">Go to sign in</a>.
        </p>
      </main>
    );
  }

  const repo = recordRepo(companyId);
  const [eventsRes, anchorsRes] = await Promise.all([
    repo.recentEventsWithHash(20),
    anchorVerification(),
  ]);
  const events = (eventsRes.data ?? []) as EventRow[];
  const anchors = (anchorsRes.data ?? []) as Array<AnchorRow & { bound_at?: string | null; scope_text?: string | null }>;

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">The record</div>
        <h1>Verify any record independently — the mathematics doesn&rsquo;t need us.</h1>
        <p className="sub">
          Every event is hashed and chained to the one before it. Ask arrives with Phase 3 —
          read-only, every answer grounded in rows it can cite.
        </p>
      </div>

      <section className="sect" aria-label="Recent records">
        <h2 className="label">Recent records · {events.length}</h2>
        {events.map((e) => {
          const receipt = typeof e.event_data?.['receipt_id'] === 'string'
            ? (e.event_data['receipt_id'] as string)
            : null;
          return (
            <div className="h-row" key={e.id}>
              <span className="tick" />
              <p>
                <b>{receipt ?? plainType(e.event_type)}</b>
                {receipt !== null ? ` — ${plainType(e.event_type)}` : ''} ·{' '}
                {sydneyDateLabel(new Date(e.created_at))} {sydneyTime(e.created_at)} · spec{' '}
                {e.spec_version ?? '0'}
              </p>
              <span className="ref">{shortHash(e.event_hash)}</span>
            </div>
          );
        })}
        {events.length === 0 ? (
          <div className="allclear">No events yet. The first shift writes the first record.</div>
        ) : null}
      </section>

      <section className="sect" aria-label="Anchors">
        <h2 className="label">Anchors</h2>
        {anchors.map((a) => (
          <div className="h-row" key={a.id}>
            <span className="tick" />
            <p>
              <b>{a.id}</b> — {a.actual_count ?? 0} events frozen
              {a.bound_at != null ? ` at the ${sydneyDateLabel(new Date(a.bound_at))} cutover` : ''}
              ; recomputed daily,{' '}
              {a.matches === true ? 'matches every check' : 'MISMATCH — evidence held'}.
            </p>
            <span className="ref">{a.matches === true ? 'verified' : 'held'}</span>
          </div>
        ))}
        {anchors.length === 0 ? (
          <div className="allclear">No anchors bound yet.</div>
        ) : null}
      </section>

      <div className="archive">
        <div className="line">
          The chain is public arithmetic. Anyone can check it. That is the point.
        </div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
