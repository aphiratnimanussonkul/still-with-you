import type { CopyKey } from '@/copy';

/**
 * Keep options in one constant. Current lock: หญิง/ชาย/ไม่ระบุ.
 * Restore `other` by adding `{ value: 'other', labelKey: 'person.gender.other' }`
 * here and `'other'` to `personGenderSchema`.
 */
export const PERSON_GENDER_OPTIONS = [
  { value: 'female', labelKey: 'person.gender.female' },
  { value: 'male', labelKey: 'person.gender.male' },
  { value: 'unspecified', labelKey: 'person.gender.unspecified' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: CopyKey }>;

export type PersonGender = 'female' | 'male' | null;

export function genderFromRadio(value: string): PersonGender {
  if (value === 'female' || value === 'male') return value;
  return null;
}

export function genderToRadio(value: PersonGender | undefined): string {
  return value ?? 'unspecified';
}
