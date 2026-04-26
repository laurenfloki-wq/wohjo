// L2.1 chunk 3 — collusion-rules unit tests
//
// Each of RULE_010 through RULE_013 gets a positive case (raises)
// and a negative case (does not raise). Edge cases captured for
// the boundary conditions that distinguish a flag from a clean
// signal.

import { describe, it, expect } from 'vitest';
import {
  checkRule010,
  checkRule011,
  checkRule012,
  checkRule013,
  haversineMetres,
  runSyncCollusionRules,
} from './collusion-rules';

describe('RULE_010 — SUSPECT_GPS_PRECISION', () => {
  it('raises when gps_accuracy_metres < 5 and no mock_location', () => {
    const r = checkRule010({
      worker_first_name: 'Joao',
      gps_accuracy_metres: 3.2,
      mock_location_reported: false,
    });
    expect(r.triggered).toBe(true);
    expect(r.flag?.ruleId).toBe('RULE_010');
    expect(r.flag?.severity).toBe('LOW');
  });

  it('does not raise when gps_accuracy_metres >= 5', () => {
    const r = checkRule010({
      worker_first_name: 'Joao',
      gps_accuracy_metres: 8,
      mock_location_reported: false,
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise when mock_location is reported (different signal already covers it)', () => {
    const r = checkRule010({
      worker_first_name: 'Joao',
      gps_accuracy_metres: 2,
      mock_location_reported: true,
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise when gps_accuracy_metres is null', () => {
    const r = checkRule010({
      worker_first_name: 'Joao',
      gps_accuracy_metres: null,
      mock_location_reported: false,
    });
    expect(r.triggered).toBe(false);
  });
});

describe('RULE_011 — RUBBER_STAMP_RISK', () => {
  it('raises when reply latency <=5s and batch >=3', () => {
    const r = checkRule011({
      supervisor_first_name: 'Mo',
      approval_count_in_batch: 5,
      reply_latency_seconds: 3,
    });
    expect(r.triggered).toBe(true);
    expect(r.flag?.ruleId).toBe('RULE_011');
    expect(r.flag?.severity).toBe('MEDIUM');
  });

  it('does not raise when latency exceeds 5 seconds', () => {
    const r = checkRule011({
      supervisor_first_name: 'Mo',
      approval_count_in_batch: 5,
      reply_latency_seconds: 30,
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise when batch contains fewer than 3 shifts', () => {
    const r = checkRule011({
      supervisor_first_name: 'Mo',
      approval_count_in_batch: 2,
      reply_latency_seconds: 3,
    });
    expect(r.triggered).toBe(false);
  });

  it('raises at the boundary: latency exactly 5 seconds + batch exactly 3', () => {
    const r = checkRule011({
      supervisor_first_name: 'Mo',
      approval_count_in_batch: 3,
      reply_latency_seconds: 5,
    });
    expect(r.triggered).toBe(true);
  });
});

describe('RULE_012 — IMPOSSIBLE_LOCATION_CHANGE', () => {
  it('raises when conflicting site is >5km away within 30 min', () => {
    const r = checkRule012({
      worker_first_name: 'Joao',
      current_site_name: 'Site A',
      conflicting: { site_name: 'Site B', distance_km: 12, minutes_ago: 10 },
    });
    expect(r.triggered).toBe(true);
    expect(r.flag?.ruleId).toBe('RULE_012');
    expect(r.flag?.severity).toBe('HIGH');
  });

  it('does not raise when conflicting is null', () => {
    const r = checkRule012({
      worker_first_name: 'Joao',
      current_site_name: 'Site A',
      conflicting: null,
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise when distance is exactly 5km (must be strictly greater)', () => {
    const r = checkRule012({
      worker_first_name: 'Joao',
      current_site_name: 'Site A',
      conflicting: { site_name: 'Site B', distance_km: 5, minutes_ago: 10 },
    });
    expect(r.triggered).toBe(false);
  });

  it('raises just above the boundary at 5.1km', () => {
    const r = checkRule012({
      worker_first_name: 'Joao',
      current_site_name: 'Site A',
      conflicting: { site_name: 'Site B', distance_km: 5.1, minutes_ago: 10 },
    });
    expect(r.triggered).toBe(true);
  });
});

describe('RULE_013 — COLLUSION_CANDIDATE', () => {
  it('raises when 100% approval AND >20 shifts AND a triggering rule fired', () => {
    const r = checkRule013({
      worker_first_name: 'Joao',
      supervisor_first_name: 'Mo',
      shifts_in_period: 25,
      approval_rate_pct: 100,
      triggering_rule_ids: ['RULE_011'],
    });
    expect(r.triggered).toBe(true);
    expect(r.flag?.ruleId).toBe('RULE_013');
    expect(r.flag?.severity).toBe('HIGH');
  });

  it('does not raise when approval rate is under 100%', () => {
    const r = checkRule013({
      worker_first_name: 'Joao',
      supervisor_first_name: 'Mo',
      shifts_in_period: 25,
      approval_rate_pct: 96,
      triggering_rule_ids: ['RULE_011'],
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise at exactly 20 shifts (must be strictly more)', () => {
    const r = checkRule013({
      worker_first_name: 'Joao',
      supervisor_first_name: 'Mo',
      shifts_in_period: 20,
      approval_rate_pct: 100,
      triggering_rule_ids: ['RULE_011'],
    });
    expect(r.triggered).toBe(false);
  });

  it('does not raise when no triggering rule has fired for the pair', () => {
    const r = checkRule013({
      worker_first_name: 'Joao',
      supervisor_first_name: 'Mo',
      shifts_in_period: 100,
      approval_rate_pct: 100,
      triggering_rule_ids: [],
    });
    expect(r.triggered).toBe(false);
  });
});

describe('runSyncCollusionRules — aggregator', () => {
  it('runs only the inputs supplied', () => {
    const flags = runSyncCollusionRules({
      rule010: {
        worker_first_name: 'Joao',
        gps_accuracy_metres: 2,
        mock_location_reported: false,
      },
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].ruleId).toBe('RULE_010');
  });

  it('runs all three when all supplied', () => {
    const flags = runSyncCollusionRules({
      rule010: {
        worker_first_name: 'Joao',
        gps_accuracy_metres: 2,
        mock_location_reported: false,
      },
      rule011: {
        supervisor_first_name: 'Mo',
        approval_count_in_batch: 5,
        reply_latency_seconds: 3,
      },
      rule012: {
        worker_first_name: 'Joao',
        current_site_name: 'A',
        conflicting: { site_name: 'B', distance_km: 12, minutes_ago: 10 },
      },
    });
    expect(flags).toHaveLength(3);
    expect(flags.map((f) => f.ruleId).sort()).toEqual([
      'RULE_010',
      'RULE_011',
      'RULE_012',
    ]);
  });

  it('returns empty when none supplied', () => {
    const flags = runSyncCollusionRules({});
    expect(flags).toEqual([]);
  });
});

describe('haversineMetres', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMetres(-33.87, 151.21, -33.87, 151.21)).toBe(0);
  });

  it('approximates Sydney↔Melbourne (~715km) within 1%', () => {
    // Sydney CBD → Melbourne CBD
    const m = haversineMetres(-33.87, 151.21, -37.81, 144.96);
    const km = m / 1000;
    expect(km).toBeGreaterThan(700);
    expect(km).toBeLessThan(720);
  });
});
