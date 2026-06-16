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

      {/* Verification-state hero — the heartbeat as a crafted instrument
          readout. Large Fraunces statement, engraved monospace data
          line, ruled corner marks. The whole panel reads as a single
          declarative thing the director can show a lawyer. */}
      <section
        className="flos-hero"
        aria-label="Substrate verification state"
        style={{ marginBottom: 'var(--s-5)' }}
      >
        {/* Hero + status chip: side-by-side on desktop, chip falls below
            on narrow viewports. Without flex-wrap the chip column kept
            its auto width and squeezed the body paragraph to one word
            per line at 390 px. flex-basis 320px keeps the text block
            wide enough to read on tablet, drops to wrap below it on
            mobile. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--s-5)',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div
              style={{
                // Mono is reserved for eyebrows/labels/IDs/coordinates and
                // the masthead readout. This eyebrow is an eyebrow.
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--ink-muted)',
                fontWeight: 600,
                marginBottom: 12,
              }}
            >
              State of the ledger · pay period {formatDate(s.pay_period_start)} –{' '}
              {formatDate(s.pay_period_end)}
            </div>
            <h1
              data-display="serif"
              style={{
                fontSize: 'min(56px, 6vw)',
                lineHeight: 1.04,
                margin: 0,
                marginBottom: 14,
                color: 'var(--ink)',
              }}
            >
              Records sealed.
              <br />
              Chain intact.
            </h1>
            <p
              style={{
                // Body prose belongs in Inter at the body scale —
                // mono on a sentence reads as a terminal, not as a
                // verification instrument.
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--t-md)',
                color: 'var(--ink-secondary)',
                lineHeight: 1.55,
                maxWidth: '60ch',
                margin: 0,
              }}
            >
              Every hour you approved is a hash-linked event you can take to a Fair Work dispute.
              The readout in the header re-checks live on every load.
            </p>
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
          </div>
          <div style={{ marginTop: 'var(--s-4)' }}>
            <Link href="/command/evidence" style={{ textDecoration: 'none' }}>
              <Button variant="primary" leadingIcon={<Download size={16} strokeWidth={1.6} />}>
                Open Evidence
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* This week — quiet secondary strip. */}
      <div style={{ marginBottom: 'var(--s-5)' }}>
        <MetricStrip
          metrics={[
            { label: 'Shifts verified', value: formatInt(s.week_shifts_verified) },
            { label: 'Hours verified', value: formatDecimal(s.week_hours_verified, 1) },
            // "Workers who worked" specifically — a workforce headcount
            // belongs on /command/workers. Distinct phrasing prevents the
            // contradiction Lauren spotted (Overview "0" vs Workers "1 active").
            {
              label: 'Workers who worked',
              value: formatInt(s.week_workers_active),
              hint: 'this week',
            },
            { label: 'Sites active', value: formatInt(s.week_sites_active) },
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
