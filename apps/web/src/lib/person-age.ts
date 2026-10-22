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

export function ageYearsFromBirthDate(birthDate: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
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

export function isFutureBirthDate(birthDate: string, now = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate > bangkokYmd(now).iso;
}
