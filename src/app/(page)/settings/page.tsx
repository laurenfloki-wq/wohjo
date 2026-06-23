// Settings — the genuine company-level controls on the warm surface. Company
// identity (name, ABN, contacts) is editable here; payroll mapping moved to
// each worker's profile; sign-out lives in the rail account menu.

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { companyRepo } from '@/lib/db/repositories/company.repo';
import { brandLine } from '@/lib/page/flags';
import CompanyDetails from './CompanyDetails';

export const dynamic = 'force-dynamic';

interface CompanyRow {
  name: string;
  abn: string | null;
  contact_email: string;
  contact_phone: string | null;
}

export default async function SettingsPage() {
  const log = routeLogger('GET /settings', null);
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) log.warn({ code: err.code }, 'settings.auth_failed');
    return (
      <main className="greet">
        <h1>Sign in to read your page.</h1>
        <p className="sub">Settings are scoped to your company and need a signed-in operator.</p>
        <div className="signin-actions">
          <a className="signin-cta" href="/field">Sign in</a>
        </div>
      </main>
    );
  }

  const { data } = await companyRepo(companyId).get();
  const company = (data ?? null) as CompanyRow | null;

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">Settings</div>
        <h1>The controls that keep pay right.</h1>
        <p className="sub">Your company&rsquo;s details. Signing out lives in your account menu, bottom-left.</p>
      </div>

      <section className="sect" aria-label="Company">
        <h2 className="label">Company</h2>
        {company !== null ? (
          <CompanyDetails company={company} />
        ) : (
          <div className="door">
            <p>We couldn&rsquo;t load your company details just now. Refresh to try again.</p>
          </div>
        )}
      </section>

      <div className="archive">
        <div className="line">Every hour counted. Every pay right.</div>
      </div>

      <div className="pagefoot">
        <span />
        <span className="brandline">{brandLine()}</span>
      </div>
    </main>
  );
}
