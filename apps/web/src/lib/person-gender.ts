import type { CopyKey } from '@/copy';

/** Keep in one constant so Kret can drop `other` later. Eddy order: หญิง/ชาย/อื่นๆ/ไม่ระบุ. */
export const PERSON_GENDER_OPTIONS = [
  { value: 'female', labelKey: 'person.gender.female' },
  { value: 'male', labelKey: 'person.gender.male' },
  { value: 'other', labelKey: 'person.gender.other' },
  { value: 'unspecified', labelKey: 'person.gender.unspecified' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: CopyKey }>;

export type PersonGender = 'female' | 'male' | 'other' | null;

export function genderFromRadio(value: string): PersonGender {
  if (value === 'female' || value === 'male' || value === 'other') return value;
  return null;
}

export function genderToRadio(value: PersonGender | undefined): string {
  return value ?? 'unspecified';
}
