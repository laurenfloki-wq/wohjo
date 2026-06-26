// /search — on-site search results page. Backs the homepage WebSite
// SearchAction (so the schema points at a real, working endpoint rather
// than a fabricated one). A plain server-rendered GET form filters the
// single indexable route source — no client JS, no second URL list.

import type { Metadata } from 'next';
import Link from 'next/link';
import '@/components/content/content.css';
import { ContentHeader, DEFAULT_DISCLAIMER } from '@/components/content/ArticleLayout';
import { contentViewport } from '@/lib/seo/metadata';
import { abs } from '@/lib/seo/site';
import { getIndexableRoutes } from '@/lib/seo/routes';

export const viewport = contentViewport;

const TITLE = 'Search';
const DESCRIPTION =
  'Search FLOSTRUCTION — guides, labour hire licensing by state, and the Workforce Ledger Evidentiary Standard.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: abs('/search') },
  // A search results page should not itself be indexed; links stay followed.
  robots: { index: false, follow: true },
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--panel)',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 16,
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#1a0f0a',
  border: 'none',
  borderRadius: 8,
  padding: '12px 22px',
  fontSize: 16,
  fontWeight: 650,
  cursor: 'pointer',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw ?? '').trim();
  const q = query.toLowerCase();

  const results = q
    ? getIndexableRoutes().filter(
        (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      )
    : [];

  return (
    <div className="flos-article">
      <ContentHeader />

      <main id="main" tabIndex={-1}>
        <div className="hero">
          <div className="wrap">
            <p className="eyebrow">Search</p>
            <h1>Search FLOSTRUCTION</h1>
            <p className="lede">
              Find guides, labour hire licensing by state, and the Workforce Ledger Evidentiary
              Standard.
            </p>
            <form action="/search" method="get" role="search" style={{ display: 'flex', gap: 10 }}>
              <label
                htmlFor="search-q"
                className="sr-only"
                style={{ position: 'absolute', left: -9999 }}
              >
                Search query
              </label>
              <input
                id="search-q"
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search, e.g. labour hire licence Queensland"
                style={inputStyle}
                autoComplete="off"
              />
              <button type="submit" style={buttonStyle}>
                Search
              </button>
            </form>
          </div>
        </div>

        <article>
          <div className="wrap">
            {query === '' ? (
              <p className="muted">Enter a search term above.</p>
            ) : results.length === 0 ? (
              <p className="muted">
                No pages matched &quot;{query}&quot;. Try a broader term, or browse the{' '}
                <a href="/guides">guides</a> or{' '}
                <a href="/labour-hire-licence">labour hire licensing hub</a>.
              </p>
            ) : (
              <>
                <p className="muted">
                  {results.length} result{results.length === 1 ? '' : 's'} for &quot;{query}&quot;.
                </p>
                <ul className="hub-list">
                  {results.map((r) => (
                    <li key={r.url}>
                      <Link className="hub-card" href={r.url}>
                        <h2>{r.title}</h2>
                        <p>{r.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </article>
      </main>

      <footer>
        <div className="wrap">
          <p className="disclaimer">{DEFAULT_DISCLAIMER}</p>
        </div>
      </footer>
    </div>
  );
}
