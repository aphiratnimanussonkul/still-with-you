import { describe, expect, it } from 'vitest';
import { computeAge, isFutureBirthDate, normalizeBirthDate } from './age.js';

describe('age (Asia/Bangkok)', () => {
  it('returns null without a birth date', () => {
    expect(computeAge(null, 'day')).toBeNull();
  });

  it('computes year-precision as calendar year difference', () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    expect(computeAge('1942-01-01', 'year', now)).toBe(84);
  });

  it('computes day-precision from month and day', () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    expect(computeAge('2000-10-22', 'day', now)).toBe(26);
    expect(computeAge('2000-10-23', 'day', now)).toBe(25);
  });

  it('stores year-only dates as YYYY-01-01', () => {
    expect(normalizeBirthDate('1942', 'year')).toBe('1942-01-01');
    expect(normalizeBirthDate('1942-06-15', 'year')).toBe('1942-01-01');
  });

  it('rejects future dates in Bangkok', () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    expect(isFutureBirthDate('2027-01-01', now)).toBe(true);
    expect(isFutureBirthDate('2020-01-01', now)).toBe(false);
  });
});
