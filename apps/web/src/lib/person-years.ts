/** Buddhist-era year helpers. Web never computes age — only formats years. */

export const BE_OFFSET = 543;

export type DatePrecision = 'day' | 'year';

export function ceYearFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

export function toBuddhistYear(ceYear: number): number {
  return ceYear + BE_OFFSET;
}

export function beYearToCeDate(beYearText: string): string | null {
  const beYear = Number(beYearText.trim());
  if (!Number.isInteger(beYear) || beYear <= BE_OFFSET) return null;
  return `${String(beYear - BE_OFFSET).padStart(4, '0')}-01-01`;
}

/** Year-only death (and birth) is stored as January 1 of that CE year. */
export function deathDateFields(input: {
  living: boolean;
  yearOnly: boolean;
  dayValue: string;
  yearBe: string;
}): { death_date: string; death_date_precision: DatePrecision } | null {
  if (input.living) return null;
  if (input.yearOnly) {
    const death_date = beYearToCeDate(input.yearBe);
    return death_date ? { death_date, death_date_precision: 'year' } : null;
  }
  const day = input.dayValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { death_date: day, death_date_precision: 'day' };
}

/** Mock/API responses must send null, not omit the key, when there is no death date. */
export function deathDatePrecisionOrNull(
  deathDate: string | null | undefined,
  requested?: DatePrecision | null
): DatePrecision | null {
  return deathDate ? (requested ?? 'year') : null;
}

export function formatNodeYears(person: {
  is_living?: boolean;
  birth_date?: string | null;
  death_date?: string | null;
}): string | null {
  const birth = ceYearFromDate(person.birth_date);
  if (birth == null) return null;
  const birthBe = toBuddhistYear(birth);
  if (person.is_living !== false) {
    return `${birthBe}–`;
  }
  const death = ceYearFromDate(person.death_date);
  if (death == null) return `${birthBe}–`;
  return `${birthBe}–${toBuddhistYear(death)}`;
}
