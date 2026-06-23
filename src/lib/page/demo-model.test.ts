import { describe, expect, it } from 'vitest';
import { buildDemoModel, type DemoScenario } from './demo-model';

const NOW = new Date('2026-06-12T08:00:00+10:00');
const SCENARIOS: DemoScenario[] = ['morning', 'cleared', 'bad'];

describe('demo canon (dispatch rail 3)', () => {
  it('is unmistakably synthetic and uses demo canon only', () => {
    for (const sc of SCENARIOS) {
      const m = buildDemoModel(sc, NOW);
      expect(m.demo).toBe(true);
      const text = JSON.stringify(m);
      // Real people of a real prospect must never appear.
      expect(text).not.toMatch(/Nguyen|Murphy|Danny|Tom\b/);
      // Demo canon names only.
      for (const n of ['João Silva', 'A. Carpenter', 'P. Rigger', 'Demo Worker', 'Mt Stromlo Works']) {
        expect(text).toContain(n);
      }
      expect(m.greeting.before + m.greeting.emphasis + m.greeting.after + m.greeting.sub).not.toContain('!');
    }
  });

  it('bad morning is scoped, blocks the run, and is the only red', () => {
    const m = buildDemoModel('bad', NOW);
    expect(m.broken).toBe(true);
    expect(m.failure?.tone).toBe('failure');
    expect(m.payrun.situation.state).toBe('HELD');
    expect(m.payrun.situation.canRun).toBe(false);
    expect(m.greeting.emphasisTone).toBe('alarm');
    expect(m.failure?.refText).toContain('FSTR-0009');
  });

  it('cleared state declares safe to run with an empty queue', () => {
    const m = buildDemoModel('cleared', NOW);
    expect(m.decisions).toHaveLength(0);
    expect(m.greeting.emphasis).toBe('safe to run');
    expect(m.payrun.situation.state).toBe('READY');
    expect(m.payrun.situation.canRun).toBe(true);
  });
});
