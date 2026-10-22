import type { CopyKey } from '@/copy';

/** Keep options in one constant: หญิง / ชาย / อื่นๆ. Clear-link sets null (no ไม่ระบุ radio). */
export const PERSON_GENDER_OPTIONS = [
  { value: 'female', labelKey: 'person.gender.female' },
  { value: 'male', labelKey: 'person.gender.male' },
  { value: 'other', labelKey: 'person.gender.other' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: CopyKey }>;

export type PersonGender = 'female' | 'male' | 'other' | null;

export function genderFromRadio(value: string): PersonGender {
  if (value === 'female' || value === 'male' || value === 'other') return value;
  return null;
}

export function genderToRadio(value: PersonGender | undefined): string {
  return value ?? '';
}
