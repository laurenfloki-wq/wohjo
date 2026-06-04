import { describe, it, expect } from 'vitest';
import {
  formatDate, formatTime, pluralise, formatHours, confidenceLabel,
  formatInt, formatDecimal, relativeTime, startTimeSourceLabel,
} from './format';

describe('format', () => {
  it('formats dates as DD MMM YYYY (en-GB style, AU timezone-aware)', () => {
    // 2026-06-04 at 07:00 UTC is still 2026-06-04 in Sydney (UTC+10)
    expect(formatDate('2026-06-04T07:00:00Z')).toBe('04 Jun 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('formats time 24-hour with optional zone', () => {
    const iso = '2026-06-04T07:30:00Z';
    expect(formatTime(iso, 'Australia/Sydney', false)).toMatch(/17:30/);
    expect(formatTime(iso, 'Australia/Sydney', true)).toMatch(/17:30 (AEST|GMT)/);
  });

  it('pluralises with the regular +s rule and a singular base', () => {
    expect(pluralise(0, 'shift')).toBe('0 shifts');
    expect(pluralise(1, 'shift')).toBe('1 shift');
    expect(pluralise(2, 'shift')).toBe('2 shifts');
  });

  it('pluralises with an explicit irregular plural', () => {
    expect(pluralise(1, 'entry', 'entries')).toBe('1 entry');
    expect(pluralise(3, 'entry', 'entries')).toBe('3 entries');
  });

  it('formats hours as "Hh Mm (D.DD h)"', () => {
    expect(formatHours(3.5)).toBe('3h 30m (3.50 h)');
    expect(formatHours(5.9333)).toBe('5h 56m (5.93 h)');
    expect(formatHours(0)).toBe('0h 0m (0.00 h)');
    expect(formatHours(-1)).toBe('—');
    expect(formatHours(Number.NaN)).toBe('—');
  });

  it('maps confidence score to calm human label', () => {
    expect(confidenceLabel(95)).toBe('Strong');
    expect(confidenceLabel(80)).toBe('Strong');
    expect(confidenceLabel(60)).toBe('Adequate');
    expect(confidenceLabel(50)).toBe('Adequate');
    expect(confidenceLabel(40)).toBe('Review');
    expect(confidenceLabel(null)).toBe('Review');
    expect(confidenceLabel(undefined)).toBe('Review');
  });

  it('formats integers and decimals with AU locale', () => {
    expect(formatInt(1234)).toBe('1,234');
    expect(formatDecimal(1234.5678, 2)).toBe('1,234.57');
  });

  it('renders relative time honestly', () => {
    const now = new Date('2026-06-04T10:00:00Z');
    expect(relativeTime(new Date('2026-06-04T09:59:50Z'), now)).toBe('just now');
    expect(relativeTime(new Date('2026-06-04T09:55:00Z'), now)).toBe('5 minutes ago');
    expect(relativeTime(new Date('2026-06-04T07:00:00Z'), now)).toBe('3 hours ago');
    expect(relativeTime(new Date('2026-06-03T10:00:00Z'), now)).toBe('1 day ago');
    expect(relativeTime(new Date('2026-06-01T10:00:00Z'), now)).toBe('3 days ago');
  });

  it('labels start_time_source in plain words', () => {
    expect(startTimeSourceLabel('geofence')).toBe('Geofence-confirmed start');
    expect(startTimeSourceLabel('worker')).toBe('Worker-confirmed start');
    expect(startTimeSourceLabel('system')).toBe('System-estimated start');
    expect(startTimeSourceLabel('unknown')).toBe('Start time recorded');
    expect(startTimeSourceLabel(null)).toBe('Start time recorded');
  });
});
