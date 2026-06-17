import { describe, it, expect } from 'vitest';
import {
  CANONICAL_CATEGORIES,
  isCanonicalCategory,
  categoryLabel,
} from './categories';

describe('payroll categories', () => {
  it('has the eight FLOSTRUCTION canonical categories', () => {
    expect(CANONICAL_CATEGORIES).toHaveLength(8);
    expect(CANONICAL_CATEGORIES).toContain('ordinary_hours');
    expect(CANONICAL_CATEGORIES).toContain('multi_storey_allowance');
  });

  it('isCanonicalCategory accepts known keys and rejects others', () => {
    expect(isCanonicalCategory('ordinary_hours')).toBe(true);
    expect(isCanonicalCategory('overtime_2x')).toBe(true);
    expect(isCanonicalCategory('unknown_category')).toBe(false);
    expect(isCanonicalCategory('')).toBe(false);
  });

  it('categoryLabel renders human-readable labels', () => {
    expect(categoryLabel('ordinary_hours')).toBe('Ordinary hours');
    expect(categoryLabel('overtime_1_5x')).toBe('Overtime 1.5×');
    expect(categoryLabel('overtime_2x')).toBe('Overtime 2×');
    expect(categoryLabel('rdo_deductions_cw2')).toBe('RDO deductions (CW2)');
    expect(categoryLabel('inclement_weather_cw2')).toBe('Inclement weather (CW2)');
    expect(categoryLabel('travel_allowance')).toBe('Travel allowance');
  });

  it('every canonical category produces a non-empty label', () => {
    for (const cat of CANONICAL_CATEGORIES) {
      expect(categoryLabel(cat).length).toBeGreaterThan(0);
    }
  });
});
