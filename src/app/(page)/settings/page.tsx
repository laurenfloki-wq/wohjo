// Settings — the utility room, re-homed into the warm surface. Payroll-
// provider mapping is editable here natively (operational config).
// Sign-out lives in the rail account menu.

import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { brandLine } from '@/lib/page/flags';
import PayrollMapping from '@/components/page/PayrollMapping';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const log = routeLogger('GET /settings', null);
  try {
    await getCompanyIdForSession(log);
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

  return (
    <main>
      <div className="top">
        <span className="wordmark">FLOSTRUCTION</span>
      </div>
      <div className="greet">
        <div className="day">Settings</div>
        <h1>The controls that keep pay right.</h1>
        <p className="sub">
          Payroll mapping is editable here. Signing out lives in your account menu, bottom-left.
        </p>
      </div>

      <section className="sect" aria-label="Payroll mapping">
        <h2 className="label">Payroll mapping</h2>
        <p className="run-note">
          Map each FLOSTRUCTION category to your payroll provider’s activity ID. These feed every
          export — the same numbers your bookkeeper expects.
        </p>
        <PayrollMapping />
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
