const BE_OFFSET = 543;

function bangkokYmd(now = new Date()): { year: number; month: number; day: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return {
    year,
    month,
    day,
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export type BirthDatePrecision = 'year' | 'day';

export type BirthInput = {
  birth_date: string;
  birth_date_precision: BirthDatePrecision;
};

export function ceYearToBe(year: number): number {
  return year + BE_OFFSET;
}

export function beYearToCe(year: number): number {
  return year - BE_OFFSET;
}

export function parseBirthInput(
  value: string,
  precision: BirthDatePrecision | ''
): BirthInput | 'invalid' | null {
  const trimmed = value.trim();
  if (!precision || !trimmed) return null;
  if (precision === 'year') {
    if (!/^\d{4}$/.test(trimmed)) return 'invalid';
    const ce = beYearToCe(Number(trimmed));
    if (!Number.isInteger(ce) || ce < 1) return 'invalid';
    return {
      birth_date: `${String(ce).padStart(4, '0')}-01-01`,
      birth_date_precision: 'year',
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { birth_date: trimmed, birth_date_precision: 'day' };
  }
  return 'invalid';
}

export function formatBirthInput(
  birthDate?: string | null,
  precision?: BirthDatePrecision | null
): string {
  if (!birthDate) return '';
  if (precision === 'year') return String(ceYearToBe(Number(birthDate.slice(0, 4))));
  return birthDate;
}

/** Mock API only — the UI never computes age. */
export function computePersonAge(
  person: {
    birth_date?: string | null;
    birth_date_precision?: BirthDatePrecision | null;
  },
  now = new Date()
): number | null {
  if (!person.birth_date) return null;
  if (person.birth_date_precision === 'year') {
    const year = Number(person.birth_date.slice(0, 4));
    if (!Number.isFinite(year)) return null;
    const age = bangkokYmd(now).year - year;
    return age >= 0 ? age : null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(person.birth_date);
  if (!match) return null;
  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  const today = bangkokYmd(now);
  let age = today.year - birthYear;
  if (today.month < birthMonth || (today.month === birthMonth && today.day < birthDay)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export function apiPersonAge(person: { age?: number | null }): number | null {
  return typeof person.age === 'number' && Number.isFinite(person.age) && person.age >= 0
    ? person.age
    : null;
}

export function personAgeCopyKey(person: {
  age?: number | null;
  birth_date_precision?: BirthDatePrecision | null;
}): 'person.age.exact' | 'person.age.approx' | null {
  if (apiPersonAge(person) == null) return null;
  return person.birth_date_precision === 'year' ? 'person.age.approx' : 'person.age.exact';
}

export function isFutureBirthDate(
  birthDate: string,
  precision?: BirthDatePrecision | null,
  now = new Date()
): boolean {
  const today = bangkokYmd(now);
  if (precision === 'year' || /^\d{4}$/.test(birthDate)) {
    const year = Number(birthDate.slice(0, 4));
    return Number.isFinite(year) && year > today.year;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate > today.iso;
}
