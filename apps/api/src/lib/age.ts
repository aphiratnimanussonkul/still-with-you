const BANGKOK = 'Asia/Bangkok';

export type BirthDatePrecision = 'day' | 'year';

export function bangkokToday(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BANGKOK,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

export function asYmd(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureBirthDate(isoDate: string, now = new Date()): boolean {
  const [year, month, day] = asYmd(isoDate).split('-').map(Number);
  const today = bangkokToday(now);
  if (year > today.year) return true;
  if (year < today.year) return false;
  if ((month || 1) > today.month) return true;
  if ((month || 1) < today.month) return false;
  return (day || 1) > today.day;
}

export function normalizeBirthDate(
  raw: string | null | undefined,
  precision: BirthDatePrecision
): string | null {
  if (raw == null || raw === '') return null;
  const year = raw.slice(0, 4);
  if (precision === 'year' || /^\d{4}$/.test(raw)) {
    return `${year}-01-01`;
  }
  return raw;
}

export function computeAge(
  birthDate: string | Date | null | undefined,
  precision: BirthDatePrecision | null | undefined,
  now = new Date()
): number | null {
  if (!birthDate) return null;
  const [year, month, day] = asYmd(birthDate).split('-').map(Number);
  const today = bangkokToday(now);
  if ((precision ?? 'day') === 'year') {
    return today.year - year;
  }
  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) {
    age -= 1;
  }
  return age;
}
