// /command Overview — the centrepiece, Mo-shaped.
//
// The dispatch's brief: a single screen that answers "are my hours
// trustworthy enough to run payroll on?" Top-down: trust banner ->
// what needs his decision -> what's ready to export -> a quiet
// "this week" strip -> live-now (only if any). Quick Setup recedes
// into the empty-state when the company has no workers/sites yet.
//
// All reads are company-scoped. Substrate untouched.

import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/server';
import { getCompanyIdForSession } from '@/lib/auth/session';
import { isAuthorizationError } from '@/lib/auth/errors';
import { routeLogger } from '@/lib/logger';
import { loadOverviewState } from './overview-state';
import {
  Card,
  CardHeader,
  PageHeader,
  Button,
  StatusChip,
  EmptyState,
  MetricStrip,
} from '@/components/command/ui';
import {
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Clock,
  Download,
  UserPlus,
  MapPin,
  MessageSquare,
} from 'lucide-react';
import { formatDate, formatHoursShort, formatInt, formatDecimal, pluralise } from '@/lib/format';

export default async function CommandOverview() {
  const log = routeLogger('GET /command/dashboard', null);

  let companyId: string;
  try {
    ({ companyId } = await getCompanyIdForSession(log));
  } catch (err) {
    if (isAuthorizationError(err)) {
      log.warn({ code: err.code, status: err.status }, 'overview.auth_failed');
    } else {
      log.error({ err }, 'overview.auth_failed_unexpected');
    }
    return (
      <Card style={{ maxWidth: 560, margin: '64px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Account unavailable</h2>
        <p style={{ color: 'var(--ink-secondary)' }}>
          We couldn’t resolve your account’s company membership. Please sign in again or contact
          support.
        </p>
      </Card>
    );
  }

  const supabase = createServiceClient();
  const s = await loadOverviewState(supabase, companyId);

  if (s.isBlankSlate) {
    return (
      <>
        <PageHeader
          title="Welcome to FLOSTRUCTION"
          description="Three things and you’re set up. Each one takes about a minute."
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--s-3)' }}>
          <SetupRow
            href="/command/workers"
            icon={<UserPlus size={18} strokeWidth={1.6} />}
            title="Add workers"
            description="Register employees with employee ID and pay rate."
          />
          <SetupRow
            href="/command/sites"
            icon={<MapPin size={18} strokeWidth={1.6} />}
            title="Add sites"
            description="Define job sites with a geofence so clock-on can be verified."
          />
          <SetupRow
            href="/command/supervisors"
            icon={<MessageSquare size={18} strokeWidth={1.6} />}
            title="Add supervisors"
            description="Set up SMS approval so site supervisors can confirm hours."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Pay period ${formatDate(s.pay_period_start)} – ${formatDate(s.pay_period_end)}. Records are sealed at the moment of capture; this view is the snapshot of where the work stands.`}
      />

      {/* Hero — the one decision number for a director running payroll:
          verified hours this pay period, the figure that GROWS through the
          week. The WLES "chain intact" trust claim lives in the integrity
          topbar alone, so this panel carries data, not a restatement of it
          (C1). The loudest type is never a bare 0 — an empty period gets an
          explicit treatment. */}
      <section
        className="flos-hero"
        aria-label="Verified hours this pay period"
        style={{ marginBottom: 'var(--s-5)' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-5)',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              Hours verified · this pay period
            </div>
            {s.week_hours_verified > 0 ? (
              <>
                <div
                  data-display="serif"
                  style={{
                    fontSize: 'min(56px, 6vw)',
                    lineHeight: 1.02,
                    margin: 0,
                    color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}
                >
                  {formatDecimal(s.week_hours_verified, 1)}
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '0.36em',
                      fontWeight: 400,
                      color: 'var(--ink-muted)',
                      marginLeft: 10,
                      letterSpacing: 0,
                    }}
                  >
                    hours
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--t-sm)',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  {pluralise(s.week_shifts_verified, 'shift')} sealed and hash-linked
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'min(34px, 4.5vw)',
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  No hours verified yet
                </div>
                <div style={{ marginTop: 12, fontSize: 'var(--t-sm)', color: 'var(--ink-muted)' }}>
                  Verified hours appear here the moment a supervisor approves a shift.
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {s.week_shifts_verified > 0 ? (
              <StatusChip kind="verified">
                {pluralise(s.week_shifts_verified, 'shift')} verified this week
              </StatusChip>
            ) : (
              <StatusChip kind="neutral">Ready for this week’s work</StatusChip>
            )}
          </div>
        </div>
      </section>

      {/* Work surface — wide desktop puts "Needs your attention" and
          "Ready to export" side-by-side (2fr / 1fr), collapsing to a
          single column under ~960px so the rhythm stays clean on
          tablet/mobile. */}
      <div className="overview-work-grid" style={{ marginBottom: 'var(--s-5)' }}>
        <Card sunken>
          <CardHeader
            title="Needs your attention"
            description="Items that won’t resolve themselves without you."
          />
          {s.needs_attention.length === 0 && s.export_blockers.length === 0 ? (
            <EmptyState
              title="Nothing needs you right now"
              description={`${pluralise(s.week_shifts_verified, 'shift')} verified this week.`}
            />
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--s-2)',
              }}
            >
              {s.needs_attention.map((item) => (
                <li key={`${item.reason}:${item.shift_id}`}>
                  <Link
                    href={item.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--s-4)',
                      padding: 'var(--s-3) var(--s-4)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      textDecoration: 'none',
                      color: 'inherit',
                      transition:
                        'border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <ReasonIcon reason={item.reason} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--ink)', fontWeight: 500 }}>
                          {item.worker_name}
                          {item.site_name ? (
                            <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>
                              {' '}
                              · {item.site_name}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
                          {item.reason_label} · {formatDate(item.shift_date)} ·{' '}
                          {formatHoursShort(item.hours)}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} strokeWidth={1.5} color="var(--ink-muted)" />
                  </Link>
                </li>
              ))}
              {s.export_blockers.map((b) => (
                <li key={`blocker:${b.worker_id}`}>
                  <Link
                    href={b.href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--s-4)',
                      padding: 'var(--s-3) var(--s-4)',
                      background: 'var(--surface)',
                      border: '1px solid var(--review-border)',
                      borderRadius: 'var(--r-md)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <AlertCircle size={18} strokeWidth={1.5} color="var(--review)" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{b.worker_name}</div>
                        <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
                          {b.blocker_label}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} strokeWidth={1.5} color="var(--ink-muted)" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <CardHeader title="Ready to export" />
            {s.ready_to_export_count === 0 ? (
              <p style={{ color: 'var(--ink-secondary)' }}>
                Nothing is final-approved yet this pay period.
              </p>
            ) : (
              <p style={{ color: 'var(--ink-secondary)' }}>
                <strong
                  style={{
                    color: 'var(--ink)',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}
                >
                  {pluralise(s.ready_to_export_count, 'shift')} ·{' '}
                  {formatDecimal(s.ready_to_export_hours, 2)} hours
                </strong>
                <br />
                ready for your payroll provider.
              </p>
            )}
            <CompletenessBar verified={s.week_shifts_verified} total={s.week_shifts_total} />
          </div>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Link href="/command/evidence" style={{ textDecoration: 'none' }}>
              <Button variant="primary" leadingIcon={<Download size={16} strokeWidth={1.6} />}>
                Review &amp; export
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* This week — quiet secondary strip. Each metric carries a
          day-of-week-bounded comparator vs the prior period (C2). Hours
          verified is the hero above, so the strip carries the period-
          activity axis (shifts, workers, sites), all sharing one
          period-scoped denominator (C3). */}
      <div style={{ marginBottom: 'var(--s-5)' }}>
        <MetricStrip
          metrics={[
            {
              label: 'Shifts verified',
              value: formatInt(s.week_shifts_verified),
              delta: weekDelta(s.week_shifts_verified, s.prior_shifts_verified),
            },
            {
              label: 'Workers on shift',
              value: formatInt(s.week_workers_active),
              delta: weekDelta(s.week_workers_active, s.prior_workers_active),
            },
            {
              label: 'Sites running',
              value: formatInt(s.week_sites_active),
              delta: weekDelta(s.week_sites_active, s.prior_sites_active),
            },
          ]}
        />
      </div>

      {/* Live now — only if any. */}
      {s.live_shifts.length > 0 ? (
        <Card>
          <CardHeader
            title="Live now"
            description={`${pluralise(s.live_shifts.length, 'shift')} in progress.`}
          />
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--s-2)',
            }}
          >
            {s.live_shifts.map((l) => (
              <li
                key={l.shift_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--s-3) var(--s-4)',
                  background: 'var(--surface-sunken)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Clock size={16} strokeWidth={1.6} color="var(--ink-muted)" />
                  <div>
                    <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{l.worker_name}</div>
                    <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
                      {l.site_name ?? 'Unknown site'}
                    </div>
                  </div>
                </div>
                <StatusChip kind="info" size="sm">
                  On shift
                </StatusChip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

// Day-of-week-bounded period-over-period comparator. A zero prior period
// shows an honest "new"/"no prior" label rather than a fabricated +100% (C2).
function weekDelta(current: number, prior: number): { dir: 'up' | 'down' | 'flat'; label: string } {
  if (prior <= 0) {
    return { dir: 'flat', label: current > 0 ? 'new this period' : '— no prior week' };
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  const dir = current > prior ? 'up' : current < prior ? 'down' : 'flat';
  return { dir, label: `${pct > 0 ? '+' : ''}${pct}% vs same point last week` };
}

// Calm completeness indicator for the export card — what share of this
// period's captured shifts are verified yet (C6). Static fill, token-only,
// reduced-motion safe by construction.
function CompletenessBar({ verified, total }: { verified: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.min(100, Math.round((verified / total) * 100));
  return (
    <div style={{ marginTop: 'var(--s-4)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--t-xs)',
          color: 'var(--ink-muted)',
          marginBottom: 6,
          fontVariantNumeric: 'tabular-nums lining-nums',
        }}
      >
        <span>
          {formatInt(verified)} of {formatInt(total)} shifts verified
        </span>
        <span>{pct}%</span>
      </div>
      <div
        role="img"
        aria-label={`${pct}% of this period's shifts verified`}
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--bg-ledger)',
          border: '1px solid var(--rule)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--verified)' }} />
      </div>
    </div>
  );
}

function ReasonIcon({
  reason,
}: {
  reason: 'pending_supervisor' | 'pending_payroll' | 'flagged' | 'disputed';
}) {
  switch (reason) {
    case 'flagged':
      return <AlertTriangle size={18} strokeWidth={1.5} color="var(--flagged)" />;
    case 'disputed':
      return <AlertTriangle size={18} strokeWidth={1.5} color="var(--flagged)" />;
    case 'pending_payroll':
      return <AlertCircle size={18} strokeWidth={1.5} color="var(--review)" />;
    case 'pending_supervisor':
    default:
      return <Clock size={18} strokeWidth={1.5} color="var(--ink-muted)" />;
  }
}

function SetupRow({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s-4)',
        padding: 'var(--s-4) var(--s-5)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        textDecoration: 'none',
        color: 'inherit',
        minHeight: 64,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <span style={{ color: 'var(--ink-secondary)' }}>{icon}</span>
        <div>
          <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{title}</div>
          <div style={{ color: 'var(--ink-secondary)', fontSize: 'var(--t-sm)' }}>
            {description}
          </div>
        </div>
      </div>
      <ChevronRight size={18} strokeWidth={1.5} color="var(--ink-muted)" />
    </Link>
  );
}
