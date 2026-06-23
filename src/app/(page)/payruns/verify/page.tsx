// Verify a pack — operator tool. Paste a file hash / verify link from any
// Evidence Pack or payroll file and re-check the hours against the live
// ledger. Static path /payruns/verify (wins over /payruns/[exportId]).
// The check itself hits the public /verify endpoint — the operator sees
// exactly what an auditor or payroll system would.

import Link from 'next/link';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { brandLine } from '@/lib/page/flags';
import VerifyTool from './VerifyTool';

export const dynamic = 'force-dynamic';

export default async function VerifyPackPage() {
  const log = routeLogger('GET /payruns/verify', null);
  try {
    await getCompanyIdForSession(log);
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'payruns.verify.auth_failed');
    } else {
      log.error({ err }, 'payruns.verify.auth_failed_unexpected');
    }
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">Verifying a pack needs a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">
            Sign in
          </a>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <Link href="/payruns" className="backlink">
        ← Pay runs
      </Link>
      <div className="greet">
        <div className="day">
          <Link href="/payruns">Pay runs</Link> · verify
        </div>
        <h1>Check any pack against the ledger.</h1>
        <p className="sub">
          Paste the receipt code from a pack — the <code>FSTR-…</code> code on every record — and
          Flostruction re-computes the hash chain live. The same proof an auditor, host employer, or
          payroll system gets. Nothing here trusts the document; it trusts the mathematics.
        </p>
      </div>

      <VerifyTool />

      <div className="archive">
        <div className="line">Don&rsquo;t trust the document. Check the ledger.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
