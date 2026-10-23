import { describe, expect, it } from 'vitest';
import { beYearToCeDate, formatNodeYears, toBuddhistYear } from '@/lib/person-years';

describe('person years', () => {
  it('formats living and deceased years in พ.ศ.', () => {
    expect(toBuddhistYear(1937)).toBe(2480);
    expect(formatNodeYears({ is_living: true, birth_date: '1937-08-01' })).toBe('2480–');
    expect(
      formatNodeYears({ is_living: false, birth_date: '1937-08-01', death_date: '2022-01-01' })
    ).toBe('2480–2565');
  });

  it('converts a Buddhist year to a year-precision CE date', () => {
    expect(beYearToCeDate('2565')).toBe('2022-01-01');
    expect(beYearToCeDate('abc')).toBeNull();
  });
});
