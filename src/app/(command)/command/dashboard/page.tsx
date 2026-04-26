import { createServiceClient } from '@/lib/supabase/server';
import CommandNav from '@/components/command/CommandNav';

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
  const supabase = createServiceClient();

  // Fetch stats in parallel
  const [workersResult, sitesResult, shiftsResult, pendingResult] = await Promise.all([
    supabase.from('workers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('sites').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('shifts').select('id, total_hours', { count: 'exact' }).gte('shift_date', getWeekStart()),
    supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('status', 'SUBMITTED'),
  ]);

  const activeWorkers = workersResult.count ?? 0;
  const activeSites = sitesResult.count ?? 0;
  const pendingApproval = pendingResult.count ?? 0;
  const weekShifts = shiftsResult.data ?? [];
  const weekHours = weekShifts.reduce((sum: number, s: { total_hours: string | null }) => sum + parseFloat(s.total_hours ?? '0'), 0);

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

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}
