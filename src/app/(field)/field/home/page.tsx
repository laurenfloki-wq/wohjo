/**
 * Flostruction Field — /field/home
 *
 * Day 6 redesign (2026-04-22) — per Lauren's "The UI IS the product"
 * brief. State-driven single-panel per B1. Branding per A4/A5.
 * No emoji (A9). No red primary actions (A8). Break selector in one
 * place only (A6), surfaced in the AWAITING_CONFIRMATION panel.
 * Wired to real APIs (/api/field/home-data, /api/field/shift/end);
 * no dead endpoints (A2). Server-authoritative state (ARCH-1).
 *
 * States:
 *   ONBOARDING              — B6, first-login only
 *   NO_SHIFT_TODAY          — State 1
 *   IN_PROGRESS             — State 2 (shift running)
 *   AWAITING_CONFIRMATION   — State 3 (end tapped or geofence left)
 *
 * Exactly one panel shown at a time. Source of truth for state is the
 * server response from /api/field/home-data plus local END_TAPPED flag
 * for the "just tapped End Shift, now confirming break" pre-submit
 * moment.
 */

'use client';

import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { createClient } from '@/lib/supabase/client';
import AddToHomeScreenPrompt from '@/components/field/AddToHomeScreenPrompt';
import { OnboardingPanel } from '@/components/field/OnboardingPanel';
import {
  InShiftProtectionNotice,
} from '@/components/field/WageProtectionNotice';
import {
  FieldErrorPanel,
  type FieldErrorCode,
} from '@/components/field/ErrorState';
import { palette, radius, typography, type FieldHomeState } from '@/lib/field/tokens';
import { FMark, FMarkKeyframes } from '@/components/field/v1/FMark';
import { HapticLockButton } from '@/components/field/v1/HapticLockButton';
import {
  formatTimeAEST,
  formatDateShort,
  formatDecimalHours,
  formatDuration,
} from '@/lib/field/format';
import {
  useGeofenceWatch,
  type GeofenceWatchSite,
} from '@/lib/intelligence/useGeofenceWatch';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  company_id: string;
}

interface PrimarySite {
  id: string;
  name: string;
  address: string | null;
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_metres: number | null;
}

interface Shift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: string | null;
  status: string;
  receipt_id: string;
  site_id: string | null;
  anomaly_flags?: unknown;
}

interface HomeData {
  worker: Worker;
  primary_site: PrimarySite | null;
  active_shift: Shift | null;
  week: {
    start: string;
    shifts: Shift[];
    verified_hours: number;
  };
  first_login: boolean;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; code: FieldErrorCode; receiptId?: string }
  | { kind: 'ready'; data: HomeData };

const VALID_BREAK_MINUTES = [0, 15, 30, 45, 60] as const;
type BreakMinutes = typeof VALID_BREAK_MINUTES[number];

export default function FieldHomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [endTapped, setEndTapped] = useState(false);
  const [selectedBreak, setSelectedBreak] = useState<BreakMinutes>(30);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ code: FieldErrorCode; receiptId?: string } | null>(null);
  const [onboardingAcked, setOnboardingAcked] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState('0h 0m');
  const [geofencePermitted, setGeofencePermitted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<FieldErrorCode | null>(null);

  const loadHomeData = useCallback(async () => {
    try {
      const res = await fetch('/api/field/home-data');
      if (res.status === 401) {
        setState({ kind: 'error', code: 'SESSION_EXPIRED' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error', code: 'SHIFT_END_NETWORK' });
        return;
      }
      const json = (await res.json()) as HomeData;
      setState({ kind: 'ready', data: json });
    } catch {
      setState({ kind: 'error', code: 'SHIFT_END_NETWORK' });
    }
  }, []);

  useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  // Ask the browser once for geolocation permission; the result drives
  // whether useGeofenceWatch actually activates. No shift starts until
  // the watcher detects site arrival (or worker taps the manual
  // fallback).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => setGeofencePermitted(status.state === 'granted'))
      .catch(() => setGeofencePermitted(false));
  }, []);

  const requestGeofencePermission = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeofencePermitted(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGeofencePermitted(true),
      () => setGeofencePermitted(false),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }, []);

  // Extract the geofence watch site spec from home-data. Runs only
  // when the worker has permission AND has no active shift AND has a
  // primary site on file. On first detection, POST shift/start then
  // reload home-data — transitioning UI from State 1 → State 2.
  const watchSite: GeofenceWatchSite | null = (() => {
    if (state.kind !== 'ready') return null;
    const site = state.data.primary_site;
    if (!site || site.geofence_lat == null || site.geofence_lng == null) return null;
    if (state.data.active_shift) return null; // Don't watch while a shift is live.
    return {
      id: site.id,
      lat: site.geofence_lat,
      lng: site.geofence_lng,
      geofence_radius_metres: site.geofence_radius_metres ?? 200,
    };
  })();

  useGeofenceWatch({
    workerId: state.kind === 'ready' ? state.data.worker.id : '',
    site: watchSite,
    permissionGranted: geofencePermitted,
  });

  // Poll home-data every 30s while State 1 (no shift) so a geofence
  // detection from useGeofenceWatch surfaces as an active shift with
  // minimal latency. (Supabase realtime is the next-iteration upgrade
  // but polling is robust enough for Phase 1.)
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (state.data.active_shift) return; // Already in State 2 or 3
    const id = setInterval(() => {
      void loadHomeData();
    }, 30_000);
    return () => clearInterval(id);
  }, [state, loadHomeData]);

  const handleStartShiftManually = async () => {
    if (state.kind !== 'ready') return;
    setStarting(true);
    setStartError(null);
    try {
      // P7-C1 — generate a UUID before POST so the server can dedupe
      // any retry to exactly one sealed event via the partial unique
      // index uq_shift_events_client_event_id. Re-using the same
      // client_event_id across retries (e.g., service-worker resync)
      // is safe and idempotent — the server returns the original
      // shift's identifiers.
      const clientEventId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      const res = await fetch('/api/field/shift/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: state.data.primary_site?.id ?? null,
          ...(clientEventId ? { client_event_id: clientEventId } : {}),
        }),
      });
      if (res.status === 401) {
        setStartError('SESSION_EXPIRED');
        return;
      }
      if (!res.ok) {
        setStartError('SHIFT_END_NETWORK');
        return;
      }
      await loadHomeData(); // transitions UI to State 2
    } catch {
      setStartError('SHIFT_END_NETWORK');
    } finally {
      setStarting(false);
    }
  };

  // Ticker for elapsed time display on State 2 / State 3.
  useEffect(() => {
    if (state.kind !== 'ready' || !state.data.active_shift) return;
    const activeStart = state.data.active_shift.start_time;
    const id = setInterval(() => {
      setElapsedLabel(formatDuration(activeStart, new Date().toISOString(), 0));
    }, 30_000);
    setElapsedLabel(formatDuration(activeStart, new Date().toISOString(), 0));
    return () => clearInterval(id);
  }, [state]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/field';
  };

  const handleTapEnd = () => {
    setEndTapped(true);
    setSubmitError(null);
  };

  const handleConfirmShift = async () => {
    if (state.kind !== 'ready' || !state.data.active_shift) return;
    const shift = state.data.active_shift;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/field/shift/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shift_id: shift.id,
          break_minutes: selectedBreak,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        receipt_id?: string;
        code?: string;
        error?: string;
      };
      if (!res.ok || !json.success) {
        // Map server codes to client-side error-state codes.
        const code: FieldErrorCode =
          json.code === 'END_BEFORE_START' || json.code === 'BELOW_MINIMUM_DURATION'
            ? 'ZERO_OR_NEGATIVE_DURATION'
            : json.code === 'EXCEEDS_MAXIMUM_DURATION'
              ? 'CLOCK_SKEW'
              : json.code === 'UNAUTHENTICATED'
                ? 'SESSION_EXPIRED'
                : 'SHIFT_END_NETWORK';
        setSubmitError({ code, receiptId: json.receipt_id ?? shift.receipt_id });
        return;
      }
      // Success — navigate to the receipt page. The receipt is the
      // record; it is NOT accessible until the shift has an end_time.
      window.location.href = `/field/receipt/${json.receipt_id}`;
    } catch {
      setSubmitError({ code: 'SHIFT_END_NETWORK', receiptId: shift.receipt_id });
    } finally {
      setSubmitting(false);
    }
  };

  const retryLoad = () => {
    setState({ kind: 'loading' });
    void loadHomeData();
  };

  // ── Render: loading ────────────────────────────────────────────────
  if (state.kind === 'loading') {
    return <LoadingScreen />;
  }

  // ── Render: load-level error ───────────────────────────────────────
  if (state.kind === 'error') {
    return (
      <main style={pageShell()}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <FieldErrorPanel code={state.code} receiptId={state.receiptId} onRetry={retryLoad} />
        </div>
      </main>
    );
  }

  const { data } = state;

  // ── Render: onboarding (B6) ────────────────────────────────────────
  if (data.first_login && !onboardingAcked) {
    return (
      <OnboardingPanel
        firstName={data.worker.first_name}
        siteName={data.primary_site?.name ?? null}
        onAcknowledge={() => setOnboardingAcked(true)}
      />
    );
  }

  // ── Derive state ──────────────────────────────────────────────────
  const activeShift = data.active_shift;
  const homeState: FieldHomeState =
    !activeShift
      ? 'NO_SHIFT_TODAY'
      : endTapped
        ? 'AWAITING_CONFIRMATION'
        : 'IN_PROGRESS';

  return (
    <main style={pageShell()}>
      <Header worker={data.worker} onSignOut={handleSignOut} />
      <AddToHomeScreenPrompt />

      {/* Verified hours block — appears on State 1 and State 2.
          Hidden in AWAITING_CONFIRMATION to keep the focus on the single
          confirmation action. */}
      {homeState !== 'AWAITING_CONFIRMATION' && (
        <VerifiedHoursBlock
          verifiedHours={data.week.verified_hours}
          hasAnyShifts={data.week.shifts.length > 0}
        />
      )}

      {homeState === 'NO_SHIFT_TODAY' && (
        <NoShiftTodayPanel
          firstName={data.worker.first_name}
          site={data.primary_site}
          geofencePermitted={geofencePermitted}
          onRequestPermission={requestGeofencePermission}
          onStartManually={handleStartShiftManually}
          starting={starting}
          startError={startError}
        />
      )}

      {homeState === 'IN_PROGRESS' && activeShift && (
        <InProgressPanel
          site={data.primary_site}
          shift={activeShift}
          elapsedLabel={elapsedLabel}
          onTapEnd={handleTapEnd}
        />
      )}

      {homeState === 'AWAITING_CONFIRMATION' && activeShift && (
        <AwaitingConfirmationPanel
          site={data.primary_site}
          shift={activeShift}
          elapsedLabel={elapsedLabel}
          selectedBreak={selectedBreak}
          onBreakChange={setSelectedBreak}
          submitting={submitting}
          submitError={submitError}
          onConfirm={handleConfirmShift}
          onReportIssue={() => {
            window.location.href = `mailto:support@flosmosis.com?subject=${encodeURIComponent(
              `Flostruction issue — receipt ${activeShift.receipt_id}`,
            )}`;
          }}
        />
      )}

      {homeState !== 'AWAITING_CONFIRMATION' && data.week.shifts.length > 0 && (
        <WeekShiftsList shifts={data.week.shifts} />
      )}
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Header
// ═════════════════════════════════════════════════════════════════════
const Header: FC<{ worker: Worker; onSignOut: () => void }> = ({ worker, onSignOut }) => (
  <header
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      marginBottom: 4,
    }}
  >
    <div>
      <div
        style={{
          fontFamily: typography.sans,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: palette.warmTextOnNavy,
          opacity: 0.8,
        }}
      >
        Flostruction
      </div>
      <div
        style={{
          fontFamily: typography.serif,
          fontSize: 24,
          fontWeight: 600,
          color: palette.warm,
          lineHeight: 1.2,
          marginTop: 2,
        }}
      >
        G&apos;day, {worker.first_name}
      </div>
    </div>
    <button
      onClick={onSignOut}
      style={{
        background: 'transparent',
        color: palette.warmTextOnNavy,
        border: `1px solid ${palette.borderOnNavy}`,
        borderRadius: radius.button,
        padding: '8px 14px',
        fontFamily: typography.sans,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  </header>
);

// ═════════════════════════════════════════════════════════════════════
// Verified Hours block
// ═════════════════════════════════════════════════════════════════════
const VerifiedHoursBlock: FC<{ verifiedHours: number; hasAnyShifts: boolean }> = ({
  verifiedHours,
  hasAnyShifts,
}) => (
  <section
    style={{
      background: palette.navyTint,
      borderRadius: radius.card,
      padding: '18px 20px',
      color: palette.warm,
    }}
  >
    <div
      style={{
        fontFamily: typography.sans,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: palette.warmTextOnNavy,
        opacity: 0.7,
        marginBottom: 6,
      }}
    >
      Verified Hours This Week
    </div>
    {hasAnyShifts ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontFamily: typography.mono,
            fontSize: 34,
            fontWeight: 700,
            color: palette.warm,
          }}
        >
          {verifiedHours.toFixed(2)}
        </span>
        <span style={{ fontSize: 14, color: palette.warmTextOnNavy, opacity: 0.75 }}>hrs</span>
      </div>
    ) : (
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.5,
          color: palette.warmTextOnNavy,
          opacity: 0.8,
        }}
      >
        Your hours appear here once you have completed your first shift.
      </p>
    )}
  </section>
);

// ═════════════════════════════════════════════════════════════════════
// State 1 — No shift today
// ═════════════════════════════════════════════════════════════════════
const NoShiftTodayPanel: FC<{
  firstName: string;
  site: PrimarySite | null;
  geofencePermitted: boolean;
  onRequestPermission: () => void;
  onStartManually: () => void;
  starting: boolean;
  startError: FieldErrorCode | null;
}> = ({ site, geofencePermitted, onRequestPermission, onStartManually, starting, startError }) => (
  <section
    style={{
      background: palette.warm,
      color: palette.textPrimary,
      borderRadius: radius.card,
      padding: '22px 22px',
      fontFamily: typography.sans,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: palette.textTertiary,
      }}
    >
      Today
    </div>
    <h2
      style={{
        fontFamily: typography.serif,
        fontSize: 22,
        fontWeight: 600,
        lineHeight: 1.25,
        margin: 0,
        color: palette.textPrimary,
      }}
    >
      No shift recorded today
    </h2>
    <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0, color: palette.textSecondary }}>
      {site
        ? `Your site geofence will detect you when you arrive at ${site.name}.`
        : 'Your site will be set up by your supervisor. Once it is, your arrival will be detected automatically.'}
    </p>

    {!geofencePermitted && site && (
      <button
        onClick={onRequestPermission}
        style={secondaryActionStyle()}
      >
        Allow location access
      </button>
    )}

    {startError && (
      <FieldErrorPanel code={startError} />
    )}

    {site && (
      // v1 visual coat — CLOCK_IN is a ceremonial seal moment.
      // Press-and-hold confirmation per founder PP1 direction.
      // Primary variant (forest) signals "sealed / confirmed".
      <HapticLockButton
        label={starting ? 'Starting shift…' : 'Start shift manually'}
        onConfirm={onStartManually}
        variant="primary"
        size="lg"
        disabled={starting}
      />
    )}
    <p
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: palette.textTertiary,
        margin: 0,
      }}
    >
      Use manual start only if you are on site and the geofence has not detected you yet.
    </p>
  </section>
);

function secondaryActionStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '13px 16px',
    background: palette.navy,
    color: palette.warm,
    border: 'none',
    borderRadius: radius.button,
    fontFamily: typography.sans,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  };
}

// ═════════════════════════════════════════════════════════════════════
// State 2 — In progress
// ═════════════════════════════════════════════════════════════════════
const InProgressPanel: FC<{
  site: PrimarySite | null;
  shift: Shift;
  elapsedLabel: string;
  onTapEnd: () => void;
}> = ({ site, shift, elapsedLabel, onTapEnd }) => (
  <section
    style={{
      position: 'relative',  // anchors the F-mark watermark
      background: palette.navy,
      color: palette.warm,
      borderRadius: radius.card,
      padding: '24px 22px',
      fontFamily: typography.sans,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      border: `1px solid ${palette.borderOnNavy}`,
      overflow: 'hidden',    // keeps the F-mark within the card
    }}
  >
    {/* v1 visual coat — F-mark watermark on IN_PROGRESS card,
        breathing animation per founder direction PP1. Opacity
        oscillates 0.08 → 0.14 over 4s. Reads as "the substrate
        is waiting / shift is sealed-in-progress". */}
    <FMarkKeyframes />
    <FMark tone="cream" breathing placement="bottom-right" size={120} />

    <PanelLabel>Status: On site</PanelLabel>
    <PanelValue>{site?.name ?? 'Your assigned site'}</PanelValue>
    <DetailLine label="Arrived" value={formatTimeAEST(shift.start_time)} />
    <DetailLine label="Time on site" value={elapsedLabel} />

    {/* v1 visual coat — HapticLockButton replaces the single-tap
        End Shift button. Press-and-hold ceremonial CLOCK_OUT
        moment. Destructive variant (warmRed) per founder PP1. */}
    <HapticLockButton
      label="End Shift"
      onConfirm={onTapEnd}
      variant="destructive"
      size="lg"
    />

    <InShiftProtectionNotice />
  </section>
);

// ═════════════════════════════════════════════════════════════════════
// State 3 — Awaiting confirmation
// ═════════════════════════════════════════════════════════════════════
const AwaitingConfirmationPanel: FC<{
  site: PrimarySite | null;
  shift: Shift;
  elapsedLabel: string;
  selectedBreak: BreakMinutes;
  onBreakChange: (b: BreakMinutes) => void;
  submitting: boolean;
  submitError: { code: FieldErrorCode; receiptId?: string } | null;
  onConfirm: () => void;
  onReportIssue: () => void;
}> = ({
  site,
  shift,
  elapsedLabel,
  selectedBreak,
  onBreakChange,
  submitting,
  submitError,
  onConfirm,
  onReportIssue,
}) => (
  <section
    style={{
      background: palette.navy,
      color: palette.warm,
      borderRadius: radius.card,
      padding: '24px 22px',
      fontFamily: typography.sans,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      border: `1px solid ${palette.borderOnNavy}`,
    }}
  >
    <PanelLabel>Shift ended — Confirm your hours</PanelLabel>
    <PanelValue>{site?.name ?? 'Your assigned site'}</PanelValue>
    <DetailLine label="Arrived" value={formatTimeAEST(shift.start_time)} />
    <DetailLine label="Departed" value={formatTimeAEST(new Date())} />
    <DetailLine label="Duration" value={elapsedLabel} />

    <div style={{ marginTop: 6 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: palette.warmTextOnNavy,
          opacity: 0.75,
          marginBottom: 8,
        }}
      >
        Break taken
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {VALID_BREAK_MINUTES.map((mins) => (
          <button
            key={mins}
            onClick={() => onBreakChange(mins)}
            disabled={submitting}
            style={{
              flex: 1,
              padding: '10px 0',
              background: selectedBreak === mins ? palette.warm : 'transparent',
              color: selectedBreak === mins ? palette.navy : palette.warm,
              border:
                selectedBreak === mins
                  ? 'none'
                  : `1px solid ${palette.borderOnNavy}`,
              borderRadius: radius.button,
              fontFamily: typography.sans,
              fontWeight: 700,
              fontSize: 13,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {mins === 0 ? 'None' : `${mins}m`}
          </button>
        ))}
      </div>
    </div>

    {submitError && (
      <FieldErrorPanel code={submitError.code} receiptId={submitError.receiptId} />
    )}

    {/* v1 visual coat — HapticLockButton replaces the single-tap
        Confirm Shift button. Press-and-hold ceremonial SHIFT_COMMIT
        moment (the seal that creates the worker's verifiable
        record). Primary variant (forest) per founder PP1. */}
    <HapticLockButton
      label={submitting ? 'Confirming…' : 'Confirm Shift'}
      onConfirm={onConfirm}
      variant="primary"
      size="lg"
      disabled={submitting}
    />

    <p
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        color: palette.mutedOnNavy,
        margin: '2px 0 0',
      }}
    >
      Your receipt will be generated and sent to your supervisor.
    </p>

    <button
      type="button"
      onClick={onReportIssue}
      style={{
        background: 'transparent',
        color: palette.warmTextOnNavy,
        border: 'none',
        padding: 0,
        marginTop: 4,
        fontFamily: typography.sans,
        fontSize: 13,
        textDecoration: 'underline',
        cursor: 'pointer',
        alignSelf: 'flex-start',
      }}
    >
      Something wrong? Report an issue.
    </button>
  </section>
);

// ═════════════════════════════════════════════════════════════════════
// This Week's Shifts (read-only list)
// ═════════════════════════════════════════════════════════════════════
const WeekShiftsList: FC<{ shifts: Shift[] }> = ({ shifts }) => (
  <section
    style={{
      background: palette.warm,
      borderRadius: radius.card,
      padding: '18px 20px',
      fontFamily: typography.sans,
      color: palette.textPrimary,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: palette.textTertiary,
        marginBottom: 12,
      }}
    >
      This Week&apos;s Shifts
    </div>
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shifts.map((s) => (
        <li
          key={s.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <span style={{ fontSize: 14, color: palette.textSecondary }}>
            {formatDateShort(s.shift_date)}
          </span>
          <span
            style={{
              fontFamily: typography.mono,
              fontSize: 13,
              fontWeight: 600,
              color: palette.textPrimary,
            }}
          >
            {s.total_hours ? formatDecimalHours(parseFloat(s.total_hours)) : '—'}
          </span>
          <StatusChip status={s.status} />
        </li>
      ))}
    </ul>
  </section>
);

const StatusChip: FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; fg: string; bg: string }> = {
    IN_PROGRESS: { label: 'in progress', fg: palette.orange, bg: palette.orangeTint },
    SUBMITTED: { label: 'awaiting supervisor', fg: palette.orange, bg: palette.orangeTint },
    SUPERVISOR_APPROVED: { label: 'supervisor approved', fg: palette.greenText, bg: palette.greenTint },
    PAYROLL_APPROVED: { label: 'payroll approved', fg: palette.greenText, bg: palette.greenTint },
    EXPORTED: { label: 'exported', fg: palette.greenText, bg: palette.greenTint },
    DISPUTED: { label: 'under review', fg: palette.red, bg: palette.redTint },
  };
  const chip = map[status] ?? { label: status.toLowerCase(), fg: palette.textTertiary, bg: palette.border };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: radius.pill,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: chip.fg,
        background: chip.bg,
      }}
    >
      {chip.label}
    </span>
  );
};

// ═════════════════════════════════════════════════════════════════════
// Shared primitives
// ═════════════════════════════════════════════════════════════════════
const PanelLabel: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: palette.warmTextOnNavy,
      opacity: 0.8,
    }}
  >
    {children}
  </div>
);

const PanelValue: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: typography.serif,
      fontSize: 22,
      lineHeight: 1.2,
      fontWeight: 600,
      color: palette.warm,
      margin: '2px 0 6px',
    }}
  >
    {children}
  </div>
);

const DetailLine: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <span
      style={{
        fontSize: 12,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: palette.mutedOnNavy,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: typography.mono,
        fontSize: 15,
        fontWeight: 500,
        color: palette.warm,
      }}
    >
      {value}
    </span>
  </div>
);

const PrimaryButton: FC<{ onClick: () => void; label: string; disabled?: boolean }> = ({
  onClick,
  label,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: '100%',
      padding: '16px 20px',
      background: disabled ? palette.navyTint : palette.warm,
      color: disabled ? palette.warmTextOnNavy : palette.navy,
      border: 'none',
      borderRadius: radius.button,
      fontFamily: typography.sans,
      fontWeight: 700,
      fontSize: 16,
      letterSpacing: '0.02em',
      cursor: disabled ? 'not-allowed' : 'pointer',
      marginTop: 4,
    }}
  >
    {label}
  </button>
);

const LoadingScreen: FC = () => (
  <main style={pageShell()}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40vh',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${palette.borderOnNavy}`,
          borderTopColor: palette.warm,
          borderRadius: '50%',
          animation: 'field-spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes field-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </main>
);

function pageShell(): React.CSSProperties {
  return {
    minHeight: '100dvh',
    background: palette.navy,
    color: palette.warm,
    padding: '28px 20px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: typography.sans,
  };
}
