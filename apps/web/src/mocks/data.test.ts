import { personListResponseSchema, personResponseSchema } from '@still-with-you/contracts';
import { describe, expect, it } from 'vitest';
import { deathDatePrecisionOrNull } from '@/lib/person-years';
import { mockPeople } from '@/mocks/data';

describe('mock people death_date_precision', () => {
  it('is null when there is no death date, never undefined', () => {
    const withoutDeath = mockPeople.filter((person) => !person.death_date);
    expect(withoutDeath.length).toBeGreaterThan(0);
    for (const person of withoutDeath) {
      expect(person).toHaveProperty('death_date_precision', null);
      expect(person.death_date_precision).not.toBeUndefined();
    }
    expect(mockPeople.find((person) => person.death_date)?.death_date_precision).toBe('year');
  });

  it('parses living mock people with explicit null precision', () => {
    const living = mockPeople.find((person) => person.is_living !== false);
    expect(living).toBeTruthy();
    expect(personResponseSchema.parse(living).death_date_precision).toBeNull();
    expect(
      personListResponseSchema.parse({ people: mockPeople, relationships: [] }).people.every(
        (person) => person.death_date_precision !== undefined
      )
    ).toBe(true);
  });

  it('builds POST mock rows with null precision when no death date is sent', () => {
    const created = {
      death_date: null as string | null,
      death_date_precision: deathDatePrecisionOrNull(null),
    };
    expect(created).toEqual({ death_date: null, death_date_precision: null });
    expect(Object.keys(created)).toContain('death_date_precision');
    expect(created.death_date_precision).not.toBeUndefined();
  });
});
