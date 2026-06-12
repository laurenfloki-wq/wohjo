import { brandLine } from '@/lib/page/flags';

export const dynamic = 'force-dynamic';

// Pay runs — arrives with Phase 2 of the page paradigm build.
// This stub keeps the rail honest at every destination without
// claiming anything the data cannot back yet.
export default function PayRunsPage() {
  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">Pay runs</div>
        <h1>A pay run is a pack you can prove.</h1>
        <p className="sub">
          This page is being built against the approved 12 June prototype and arrives with the
          next phase. Today carries everything that needs you.
        </p>
      </div>
      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
