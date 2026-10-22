import { describe, expect, it } from 'vitest';
import { PERSON_GENDER_OPTIONS, genderFromRadio, genderToRadio } from '@/lib/person-gender';

describe('person gender options', () => {
  it('keeps female/male/other/unspecified in one constant', () => {
    expect(PERSON_GENDER_OPTIONS.map((option) => option.value)).toEqual([
      'female',
      'male',
      'other',
      'unspecified',
    ]);
    expect(genderFromRadio('female')).toBe('female');
    expect(genderFromRadio('male')).toBe('male');
    expect(genderFromRadio('other')).toBe('other');
    expect(genderFromRadio('unspecified')).toBeNull();
    expect(genderToRadio(null)).toBe('unspecified');
    expect(genderToRadio('other')).toBe('other');
  });
});
