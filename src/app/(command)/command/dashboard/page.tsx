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
      background: 'var(--color-bg-secondary)', // charcoal-800 raised within .command-dark
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-card)',
      padding: '20px 24px',
      boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--color-text-secondary)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 36,
        fontWeight: 700,
        color: accent ?? 'var(--color-text-primary)',
        fontFamily: 'var(--font-mono)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          marginTop: 8,
          fontFamily: 'var(--font-sans)',
        }}>{sub}</div>
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
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Dashboard unavailable
          </h1>
          <p style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: 'var(--color-text-tertiary)',
            marginTop: 16,
            fontFamily: 'var(--font-sans)',
          }}>
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-text-tertiary)',
            marginBottom: 8,
          }}>
            Command
          </div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            margin: 0,
            letterSpacing: '-0.012em',
            lineHeight: 1.05,
          }}>
            Dashboard
          </h1>
          <p style={{
            fontSize: 14,
            color: 'var(--color-text-tertiary)',
            marginTop: 8,
            fontFamily: 'var(--font-sans)',
          }}>
            Labour hire payroll · verified hours, sealed records.
          </p>
        </div>

        {/* 4 stat cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}>
          <StatCard label="Active workers" value={activeWorkers} />
          <StatCard label="Active sites" value={activeSites} />
          <StatCard label="This week hours" value={weekHours.toFixed(1)} sub="across all workers" />
          <StatCard
            label="Pending approval"
            value={pendingApproval}
            sub={pendingApproval > 0 ? 'shifts awaiting supervisor' : 'all clear'}
            accent={pendingApproval > 0 ? 'var(--color-amber)' : 'var(--color-green)'}
          />
        </div>

        {/* Quick setup */}
        <div style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          padding: '24px 28px',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
            marginBottom: 18,
          }}>
            Quick setup
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/command/workers', label: 'Add workers', desc: 'Register employees with employee ID and pay rate' },
              { href: '/command/sites', label: 'Add sites', desc: 'Define job sites with geofencing' },
              { href: '/command/supervisors', label: 'Add supervisors', desc: 'Set up SMS approval for site supervisors' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 16px',
                  background: 'rgba(245, 242, 234, 0.03)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-btn)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'background 0.15s, border-color 0.15s',
                  minHeight: 'auto',
                }}
              >
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 15,
                    color: 'var(--color-text-primary)',
                    marginBottom: 2,
                  }}>{item.label}</div>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'var(--font-sans)',
                  }}>{item.desc}</div>
                </div>
                <span style={{
                  color: 'var(--color-text-tertiary)',
                  fontSize: 18,
                  fontFamily: 'var(--font-mono)',
                }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

