import { describe, it, expect } from 'vitest';
import { computeRunReadiness, runButtonLabel } from './run-readiness';

describe('computeRunReadiness — the safe gate', () => {
  it('HELD when the chain is broken, regardless of counts', () => {
    const r = computeRunReadiness({ chainBroken: true, waitingCount: 0, approvedCount: 5 });
    expect(r.state).toBe('HELD');
    expect(r.canRun).toBe(false);
  });

  it('WAITING when shifts still await approval', () => {
    const r = computeRunReadiness({ chainBroken: false, waitingCount: 2, approvedCount: 5 });
    expect(r.state).toBe('WAITING');
    expect(r.canRun).toBe(false);
    expect(r.reason).toContain('2 shifts are');
  });

  it('EMPTY when nothing is approved', () => {
    const r = computeRunReadiness({ chainBroken: false, waitingCount: 0, approvedCount: 0 });
    expect(r.state).toBe('EMPTY');
    expect(r.canRun).toBe(false);
  });

  it('READY only when green, nothing waiting, and >=1 approved', () => {
    const r = computeRunReadiness({ chainBroken: false, waitingCount: 0, approvedCount: 1 });
    expect(r.state).toBe('READY');
    expect(r.canRun).toBe(true);
    expect(r.reason).toContain('1 approved shift');
  });

  it('chain-broken takes precedence over waiting', () => {
    const r = computeRunReadiness({ chainBroken: true, waitingCount: 3, approvedCount: 0 });
    expect(r.state).toBe('HELD');
  });

  it('labels: held/empty are explicit, waiting/ready read "Run when safe"', () => {
    expect(runButtonLabel('HELD')).toContain('Held');
    expect(runButtonLabel('EMPTY')).toContain('Nothing');
    expect(runButtonLabel('WAITING')).toBe('Run when safe');
    expect(runButtonLabel('READY')).toBe('Run when safe');
  });
});
