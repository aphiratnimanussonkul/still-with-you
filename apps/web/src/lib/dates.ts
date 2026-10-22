/**
 * API timestamps are ISO 8601 UTC. Display them in the Thai locale
 * (Buddhist calendar, Asia/Bangkok).
 */
export function formatThaiDate(iso: string): string {
  const date = parseApiDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function formatThaiDateTime(iso: string): string {
  const date = parseApiDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

function parseApiDate(iso: string): Date | null {
  const value = iso.length === 10 ? `${iso}T00:00:00.000Z` : iso;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
