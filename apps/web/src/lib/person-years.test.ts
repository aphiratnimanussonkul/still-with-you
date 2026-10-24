import { describe, expect, it } from 'vitest';
import {
  beYearToCeDate,
  deathDateFields,
  deathDatePrecisionOrNull,
  formatNodeYears,
  livingDeathWriteFields,
  toBuddhistYear,
} from '@/lib/person-years';

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

  it('sends a full death date with day precision', () => {
    expect(
      deathDateFields({ living: false, yearOnly: false, dayValue: '2022-03-15', yearBe: '' })
    ).toEqual({ death_date: '2022-03-15', death_date_precision: 'day' });
  });

  it('stores year-only death as January 1 with year precision', () => {
    expect(
      deathDateFields({ living: false, yearOnly: true, dayValue: '2022-03-15', yearBe: '2565' })
    ).toEqual({ death_date: '2022-01-01', death_date_precision: 'year' });
  });

  it('omits death fields when living or the date is empty', () => {
    expect(
      deathDateFields({ living: true, yearOnly: false, dayValue: '2022-03-15', yearBe: '2565' })
    ).toBeNull();
    expect(
      deathDateFields({ living: false, yearOnly: false, dayValue: '', yearBe: '' })
    ).toBeNull();
    expect(
      deathDateFields({ living: false, yearOnly: true, dayValue: '', yearBe: '' })
    ).toBeNull();
  });

  it('returns null death_date_precision when there is no death date, never undefined', () => {
    expect(deathDatePrecisionOrNull(null)).toBeNull();
    expect(deathDatePrecisionOrNull(undefined)).toBeNull();
    expect(deathDatePrecisionOrNull('')).toBeNull();
    expect(deathDatePrecisionOrNull('2022-01-01', 'day')).toBe('day');
    expect(deathDatePrecisionOrNull('2022-01-01')).toBe('year');
    const mockRow = { death_date_precision: deathDatePrecisionOrNull(null) };
    expect(mockRow).toHaveProperty('death_date_precision', null);
    expect(mockRow.death_date_precision).not.toBeUndefined();
  });

  it('clears death_date and death_date_precision when switching back to living', () => {
    expect(
      livingDeathWriteFields({ living: true, yearOnly: false, dayValue: '2022-03-15', yearBe: '2565' })
    ).toEqual({ is_living: true, death_date: null, death_date_precision: null });
    expect(Object.keys(livingDeathWriteFields({ living: true, yearOnly: true, dayValue: '', yearBe: '' }))).toEqual(
      ['is_living', 'death_date', 'death_date_precision']
    );
  });
});
