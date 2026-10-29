import { BE_OFFSET, toBuddhistYear } from '@/lib/person-years';

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

/** Create-memory date field: year-only / year+month / full day. */
export type EventDatePrecision = 'year' | 'month' | 'day';

export type EventDatePayload = {
  occurred_from: string;
  date_precision: EventDatePrecision;
};

const EARLIEST_BE_YEAR = 2400;

export function currentBuddhistYear(now = new Date()): number {
  const ce = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(now)
  );
  return toBuddhistYear(ce);
}

export function buddhistYearOptions(now = new Date()): number[] {
  const current = currentBuddhistYear(now);
  const years: number[] = [];
  for (let year = current; year >= EARLIEST_BE_YEAR; year -= 1) years.push(year);
  return years;
}

export function thaiMonthLabel(month: number): string {
  return new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(new Date(2000, month - 1, 1));
}

export function daysInCalendarMonth(yearBe: string, month: string): number {
  const monthNum = Number(month);
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) return 31;
  const be = Number(yearBe);
  const ce = Number.isInteger(be) && be > BE_OFFSET ? be - BE_OFFSET : 2000;
  return new Date(Date.UTC(ce, monthNum, 0)).getUTCDate();
}

export function eventDatePayload(
  yearBe: string,
  month: string,
  day: string
): EventDatePayload | undefined {
  const be = Number(yearBe);
  if (!Number.isInteger(be) || be <= BE_OFFSET) return undefined;
  const ce = String(be - BE_OFFSET).padStart(4, '0');
  if (!month) return { occurred_from: `${ce}-01-01`, date_precision: 'year' };
  const monthNum = Number(month);
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) return undefined;
  const mm = String(monthNum).padStart(2, '0');
  if (!day) return { occurred_from: `${ce}-${mm}-01`, date_precision: 'month' };
  const maxDay = daysInCalendarMonth(yearBe, month);
  const dayNum = Number(day);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > maxDay) return undefined;
  return {
    occurred_from: `${ce}-${mm}-${String(dayNum).padStart(2, '0')}`,
    date_precision: 'day',
  };
}
