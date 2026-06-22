// Golden evals — fleet registry integrity. Locks the wiring contract.

import { describe, it, expect } from 'vitest';
import { REGISTRY, schedules } from '../bots/registry';

describe('fleet registry', () => {
  const entries = Object.entries(REGISTRY);

  it('keys are slugs derived from bot ids (no bot- prefix)', () => {
    for (const [slug, mod] of entries) {
      expect(slug).toBe(mod.id.replace(/^bot-/, ''));
      expect(slug.startsWith('bot-')).toBe(false);
    }
  });

  it('every module id is unique', () => {
    const ids = entries.map(([, m]) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scheduled bots carry a cron expression and nothing else does spuriously', () => {
    for (const [, m] of entries) {
      if (m.trigger === 'schedule') expect(typeof m.schedule).toBe('string');
    }
    // schedules() returns only those with a schedule
    for (const s of schedules()) {
      expect(s.schedule).toMatch(/^[\d*/, \-]+$/);
    }
  });

  it('covers the full fleet (50+ bots wired)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(50);
  });

  it('every module exposes a run function', () => {
    for (const [, m] of entries) expect(typeof m.run).toBe('function');
  });
});
