// Dashboard server component — scoped to the session's company_id.
//
// 2026-04-30 substrate-DD fix: prior version called createServiceClient()
// (bypasses RLS) and ran four count queries with NO company_id filter,
// producing global counts across every tenant in the database. That
// surfaced as a tenant-isolation finding during FLOSMOSIS Test smoke
// verification — Pending Approval: 3 was counting orphan shifts on a
// deleted company; Active Workers/Sites: 0 was misleading.
//
// Fix: resolve companyId via getCompanyIdForSession() up front, then
// scope every count query with .eq('company_id', companyId). Auth
// failures fall back to a structured error UI rather than rendering
// wrong numbers.
//
// See ~/Desktop/FLOSTRUCTION-Build/dashboard-scoping-audit-2026-04-30.md
// for the full audit covering all multi-tenant queries in the codebase.

import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import CommandNav from '@/components/command/CommandNav';
import { loadDashboardCounters } from './counters';

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--color-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '20px 24px',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-tertiary)', letterSpacing: '0.05em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '32px', fontWeight: 800, color: accent ?? 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '6px' }}>{sub}</div>
      )}
    </div>
  );
}

export default async function CommandDashboard() {
  const log = routeLogger('GET /command/dashboard', null);

  // Resolve session → company_id BEFORE any DB read.
  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'dashboard.auth_failed');
    } else {
      log.error({ err }, 'dashboard.auth_failed_unexpected');
    }
    return (
      <>
        <CommandNav />
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
            Dashboard unavailable
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '12px' }}>
            We couldn&apos;t resolve your account&apos;s company membership. Please sign in again, or contact support@flosmosis.com if this persists.
          </p>
        </div>
      </>
    );
  }

  const supabase = createServiceClient();
  const { activeWorkers, activeSites, weekHours, pendingApproval } =
    await loadDashboardCounters(supabase, companyId);

  return (
    <>
      <CommandNav />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
            Flostruction Command
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Labour hire payroll dashboard
          </p>
        </div>

        {/* 4 stat cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          <StatCard label="ACTIVE WORKERS" value={activeWorkers} />
          <StatCard label="ACTIVE SITES" value={activeSites} />
          <StatCard label="THIS WEEK HOURS" value={weekHours.toFixed(1)} sub="across all workers" />
          <StatCard
            label="PENDING APPROVAL"
            value={pendingApproval}
            sub={pendingApproval > 0 ? 'shifts awaiting supervisor' : 'all clear'}
            accent={pendingApproval > 0 ? 'var(--color-amber)' : undefined}
          />
        </div>

        {/* Quick links */}
        <div style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '20px 24px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: '14px' }}>
            QUICK SETUP
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { href: '/command/workers', label: 'Add workers', desc: 'Register employees with employee ID and pay rate' },
              { href: '/command/sites', label: 'Add sites', desc: 'Define job sites with geofencing' },
              { href: '/command/supervisors', label: 'Add supervisors', desc: 'Set up SMS approval for site supervisors' },
            ].map(item => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-btn)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)' }}>{item.label}</div>
                  <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>{item.desc}</div>
                </div>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '16px' }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

