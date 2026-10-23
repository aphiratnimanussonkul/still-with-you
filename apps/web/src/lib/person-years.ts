/** Buddhist-era year helpers. Web never computes age — only formats years. */

export const BE_OFFSET = 543;

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
