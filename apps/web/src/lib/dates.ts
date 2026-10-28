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

/** Story-card date slot (`story.item.date`): "12 ต.ค. 2569". */
export function formatStoryItemDate(iso: string): string {
  const date = parseApiDate(iso);
  if (!date) return iso;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export const JUST_NOW_MS = 60_000;

export function isJustNow(iso: string, now = Date.now()): boolean {
  const date = parseApiDate(iso);
  if (!date) return false;
  const delta = now - date.getTime();
  return delta >= 0 && delta < JUST_NOW_MS;
}

function parseApiDate(iso: string): Date | null {
  const value = iso.length === 10 ? `${iso}T00:00:00.000Z` : iso;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
