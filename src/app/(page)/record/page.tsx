// The record — live. Recent records with truncated hashes; Anchors
// including the 4 June cutover. "Verify any record independently —
// the mathematics doesn't need us."

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { anchorVerification, recordRepo } from '@/lib/db/repositories/page.repo';
import { sydneyDateLabel, sydneyTime, type AnchorRow } from '@/lib/page/today-data';
import { brandLine } from '@/lib/page/flags';
import Link from 'next/link';

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
  return t
    .replace(/^X-FLOSMOSIS-/, 'system ')
    .replace(/_/g, ' ')
    .toLowerCase();
}

const PAGE_SIZE = 20;

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' && sp.q.trim().length > 0 ? sp.q.trim() : null;
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;
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
          The record is your company&rsquo;s sealed events and needs a signed-in operator.
        </p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  const repo = recordRepo(companyId);
  const [eventsRes, anchorsRes] = await Promise.all([
    repo.eventsPage({ limit: PAGE_SIZE, offset, q }),
    anchorVerification(),
  ]);
  const events = (eventsRes.data ?? []) as EventRow[];
  const totalCount = eventsRes.count ?? events.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const qParam = q !== null ? `q=${encodeURIComponent(q)}&` : '';
  const anchors = (anchorsRes.data ?? []) as Array<
    AnchorRow & { bound_at?: string | null; scope_text?: string | null }
  >;

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">The record</div>
        <h1>Verify any record independently — the mathematics doesn&rsquo;t need us.</h1>
        <p className="sub">
          Every event is hashed and chained to the one before it. Search by receipt or event type —
          every row opens its independently-verifiable proof.
        </p>
      </div>

      <form className="recsearch" method="get" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by receipt or event type…"
          aria-label="Search records"
        />
        <button type="submit" className="btn quiet">
          Search
        </button>
        {q !== null ? (
          <Link className="recclear" href="/record">
            Clear
          </Link>
        ) : null}
      </form>

      <section className="sect" aria-label="Records">
        <h2 className="label">
          {q !== null ? `Records matching “${q}”` : 'Records'} · {totalCount}
        </h2>
        {events.map((e) => {
          const receipt =
            typeof e.event_data?.['receipt_id'] === 'string'
              ? (e.event_data['receipt_id'] as string)
              : null;
          return (
            <Link className="h-row" href={`/record/${e.id}`} key={e.id}>
              <span className="tick" />
              <p>
                <b>{receipt ?? plainType(e.event_type)}</b>
                {receipt !== null ? ` — ${plainType(e.event_type)}` : ''} ·{' '}
                {sydneyDateLabel(new Date(e.created_at))} {sydneyTime(e.created_at)} · spec{' '}
                {e.spec_version ?? '0'}
              </p>
              <span className="ref">{shortHash(e.event_hash)}</span>
            </Link>
          );
        })}
        {events.length === 0 ? (
          <div className="allclear">
            {q !== null
              ? 'No records match that search.'
              : 'No events yet. The first shift writes the first record.'}
          </div>
        ) : null}
        {totalPages > 1 ? (
          <nav className="pager" aria-label="Record pages">
            {pageNum > 1 ? (
              <Link className="btn quiet" href={`/record?${qParam}page=${pageNum - 1}`}>
                ← Newer
              </Link>
            ) : (
              <span className="btn quiet disabled" aria-disabled="true">
                ← Newer
              </span>
            )}
            <span className="pagenum">
              Page {pageNum} of {totalPages}
            </span>
            {pageNum < totalPages ? (
              <Link className="btn quiet" href={`/record?${qParam}page=${pageNum + 1}`}>
                Older →
              </Link>
            ) : (
              <span className="btn quiet disabled" aria-disabled="true">
                Older →
              </span>
            )}
          </nav>
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
        {anchors.length === 0 ? <div className="allclear">No anchors bound yet.</div> : null}
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
