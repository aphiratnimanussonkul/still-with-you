import { describe, expect, it } from 'vitest';
import {
  ageFromYearOnly,
  ageYearsFromBirthDate,
  displayPersonAge,
  formatBirthInput,
  isFutureBirthDate,
  parseBirthInput,
} from '@/lib/person-age';

describe('person age', () => {
  it('computes age in Asia/Bangkok and hides future dates', () => {
    expect(ageYearsFromBirthDate('2018-04-12', new Date('2026-10-22T00:00:00.000Z'))).toBe(8);
    expect(ageYearsFromBirthDate('2018-10-23', new Date('2026-10-22T16:59:00.000Z'))).toBe(7);
    expect(ageYearsFromBirthDate('2018-10-23', new Date('2026-10-22T17:00:00.000Z'))).toBe(8);
    expect(isFutureBirthDate('2099-01-01', 'day', new Date('2026-10-22T00:00:00.000Z'))).toBe(true);
    expect(isFutureBirthDate('2018-04-12', 'day', new Date('2026-10-22T00:00:00.000Z'))).toBe(false);
  });

  it('parses year-only birth as YYYY-01-01 and uses a year diff for age', () => {
    expect(parseBirthInput('2018')).toEqual({ birth_date: '2018-01-01', birth_date_precision: 'year' });
    expect(parseBirthInput('2018-04-12')).toEqual({
      birth_date: '2018-04-12',
      birth_date_precision: 'day',
    });
    expect(parseBirthInput('')).toBeNull();
    expect(parseBirthInput('18')).toBe('invalid');
    expect(formatBirthInput('2018-01-01', 'year')).toBe('2018');
    expect(ageFromYearOnly('2018-01-01', new Date('2026-10-22T00:00:00.000Z'))).toBe(8);
    expect(isFutureBirthDate('2099-01-01', 'year', new Date('2026-10-22T00:00:00.000Z'))).toBe(true);
  });

  it('prefers API age and otherwise computes from precision', () => {
    expect(displayPersonAge({ age: 78, birth_date: '1948-08-01', birth_date_precision: 'day' })).toBe(78);
    expect(
      displayPersonAge(
        { birth_date: '2018-01-01', birth_date_precision: 'year' },
        new Date('2026-10-22T00:00:00.000Z')
      )
    ).toBe(8);
    expect(displayPersonAge({ birth_date: null, age: null })).toBeNull();
  });
});
