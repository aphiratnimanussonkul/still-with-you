import { describe, expect, it } from 'vitest';
import { ageYearsFromBirthDate, isFutureBirthDate } from '@/lib/person-age';

describe('person age', () => {
  it('computes age in Asia/Bangkok and hides future dates', () => {
    expect(ageYearsFromBirthDate('2018-04-12', new Date('2026-10-22T00:00:00.000Z'))).toBe(8);
    expect(ageYearsFromBirthDate('2018-10-23', new Date('2026-10-22T16:59:00.000Z'))).toBe(7);
    expect(ageYearsFromBirthDate('2018-10-23', new Date('2026-10-22T17:00:00.000Z'))).toBe(8);
    expect(isFutureBirthDate('2099-01-01', new Date('2026-10-22T00:00:00.000Z'))).toBe(true);
    expect(isFutureBirthDate('2018-04-12', new Date('2026-10-22T00:00:00.000Z'))).toBe(false);
  });
});
