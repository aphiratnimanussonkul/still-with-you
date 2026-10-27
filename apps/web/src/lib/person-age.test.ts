import { describe, expect, it } from 'vitest';
import {
  apiPersonAge,
  beYearToCe,
  ceYearToBe,
  computePersonAge,
  formatBirthInput,
  isFutureBirthDate,
  parseBirthInput,
  personAgeCopyKey,
} from '@/lib/person-age';

describe('person age', () => {
  it('converts Buddhist-era years to CE YYYY-01-01', () => {
    expect(ceYearToBe(2018)).toBe(2561);
    expect(beYearToCe(2561)).toBe(2018);
    expect(parseBirthInput('2561', 'year')).toEqual({
      birth_date: '2018-01-01',
      birth_date_precision: 'year',
    });
    expect(parseBirthInput('2018-04-12', 'day')).toEqual({
      birth_date: '2018-04-12',
      birth_date_precision: 'day',
    });
    expect(parseBirthInput('', 'year')).toBeNull();
    expect(parseBirthInput('18', 'year')).toBe('invalid');
    expect(formatBirthInput('2018-01-01', 'year')).toBe('2561');
    expect(isFutureBirthDate('2157-01-01', 'year', new Date('2026-10-22T00:00:00.000Z'))).toBe(true);
  });

  it('displays API age only and still computes age in the mock API', () => {
    expect(apiPersonAge({ age: 78 })).toBe(78);
    expect(apiPersonAge({ age: null })).toBeNull();
    expect(personAgeCopyKey({ age: null })).toBeNull();
    expect(personAgeCopyKey({ age: 36, birth_date_precision: 'day' })).toBe('person.age.exact');
    expect(personAgeCopyKey({ age: 91, birth_date_precision: 'year' })).toBe('person.age.approx');
    expect(
      computePersonAge(
        { birth_date: '2018-04-12', birth_date_precision: 'day' },
        new Date('2026-10-22T00:00:00.000Z')
      )
    ).toBe(8);
    expect(
      computePersonAge(
        { birth_date: '2018-01-01', birth_date_precision: 'year' },
        new Date('2026-10-22T00:00:00.000Z')
      )
    ).toBe(8);
  });
});
