// Dual-time offline capture assessment — unit tests (Decision 2026-07-02).
import { describe, it, expect } from 'vitest';
import {
  assessOfflineCapture,
  OFFLINE_CAPTURE_MAX_GAP_SECONDS,
  offlineCaptureMetadata,
} from './offline-capture';

const SERVER_NOW = new Date('2026-07-02T09:00:00.000Z');

describe('assessOfflineCapture', () => {
  it('accepts a clean capture with an accurate device clock', () => {
    const r = assessOfflineCapture(
      { captured_at: '2026-07-02T07:00:00.000Z', client_now: '2026-07-02T09:00:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assessment.clockSkewSeconds).toBe(0);
    expect(r.assessment.captureToSealSeconds).toBe(2 * 3600);
    expect(r.assessment.thresholdExceeded).toBe(false);
  });

  it('measures device clock skew and adjusts the capture estimate', () => {
    // Device runs 10 minutes fast: asserts 07:10 for a real-world 07:00.
    const r = assessOfflineCapture(
      { captured_at: '2026-07-02T07:10:00.000Z', client_now: '2026-07-02T09:10:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assessment.clockSkewSeconds).toBe(600);
    expect(r.assessment.capturedAtSkewAdjusted).toBe('2026-07-02T07:00:00.000Z');
    expect(r.assessment.captureToSealSeconds).toBe(2 * 3600);
  });

  it('flags a capture-to-seal gap beyond the 12-hour threshold', () => {
    const r = assessOfflineCapture(
      { captured_at: '2026-07-01T20:00:00.000Z', client_now: '2026-07-02T09:00:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assessment.captureToSealSeconds).toBe(13 * 3600);
    expect(r.assessment.captureToSealSeconds).toBeGreaterThan(OFFLINE_CAPTURE_MAX_GAP_SECONDS);
    expect(r.assessment.thresholdExceeded).toBe(true);
  });

  it('rejects a capture asserted after the device clock at sync', () => {
    const r = assessOfflineCapture(
      { captured_at: '2026-07-02T09:30:00.000Z', client_now: '2026-07-02T09:00:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a capture that resolves to the future after skew adjustment', () => {
    // Device 2h slow; asserts a capture "now" on its own clock that maps
    // to the server future once skew is removed... construct: skew=-7200,
    // captured 07:30 device = 09:30 server-adjusted (> 09:00 + tolerance).
    const r = assessOfflineCapture(
      { captured_at: '2026-07-02T07:30:00.000Z', client_now: '2026-07-02T07:00:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(false);
  });

  it('rejects malformed timestamps', () => {
    expect(assessOfflineCapture({ captured_at: 'yesterday', client_now: '2026-07-02T09:00:00Z' }, SERVER_NOW).ok).toBe(false);
    expect(assessOfflineCapture({ captured_at: '2026-07-02T08:00:00Z' }, SERVER_NOW).ok).toBe(false);
    expect(assessOfflineCapture({}, SERVER_NOW).ok).toBe(false);
  });

  it('emits the x-flos-offline-capture extension block per §9.2', () => {
    const r = assessOfflineCapture(
      { captured_at: '2026-07-02T07:00:00.000Z', client_now: '2026-07-02T09:00:00.000Z' },
      SERVER_NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const meta = offlineCaptureMetadata(r.assessment);
    const block = meta['x-flos-offline-capture'] as Record<string, unknown>;
    expect(block.captured_at).toBe('2026-07-02T07:00:00.000Z');
    expect(block.sealed_at).toBe('2026-07-02T09:00:00.000Z');
    expect(block.capture_gap_exceeded).toBe(false);
  });
});
