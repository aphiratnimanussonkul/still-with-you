import { describe, expect, it } from 'vitest';
import { PERSON_GENDER_OPTIONS, genderFromRadio, genderToRadio } from '@/lib/person-gender';

describe('person gender options', () => {
  it('keeps female/male/other in one constant and maps empty radio to null', () => {
    expect(PERSON_GENDER_OPTIONS.map((option) => option.value)).toEqual(['female', 'male', 'other']);
    expect(genderFromRadio('female')).toBe('female');
    expect(genderFromRadio('male')).toBe('male');
    expect(genderFromRadio('other')).toBe('other');
    expect(genderFromRadio('unspecified')).toBeNull();
    expect(genderFromRadio('')).toBeNull();
    expect(genderToRadio(null)).toBe('');
  });
});
