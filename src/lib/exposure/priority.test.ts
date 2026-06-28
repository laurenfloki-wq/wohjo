import { describe, it, expect } from 'vitest';
import { leadPriority } from './priority';

describe('leadPriority (P6)', () => {
  it('large firm + exposed = High', () => {
    expect(leadPriority('200+', 'exposed').label).toBe('High');
    expect(leadPriority('51-200', 'exposed').label).toBe('High');
  });
  it('exposed but smaller firm = Medium', () => {
    expect(leadPriority('21-50', 'exposed').label).toBe('Medium');
    expect(leadPriority(null, 'exposed').label).toBe('Medium');
  });
  it('large firm + watch = Medium', () => {
    expect(leadPriority('200+', 'watch').label).toBe('Medium');
  });
  it('small/clear = Low', () => {
    expect(leadPriority('6-20', 'watch').label).toBe('Low');
    expect(leadPriority('1-5', 'clear').label).toBe('Low');
  });
  it('rank sorts hotter leads higher', () => {
    expect(leadPriority('200+', 'exposed').rank).toBeGreaterThan(leadPriority('1-5', 'exposed').rank);
    expect(leadPriority('21-50', 'exposed').rank).toBeGreaterThan(leadPriority('21-50', 'watch').rank);
  });
});
