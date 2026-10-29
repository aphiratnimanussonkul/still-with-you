import { describe, expect, it } from 'vitest';
import {
  buddhistYearOptions,
  currentBuddhistYear,
  daysInCalendarMonth,
  eventDatePayload,
  formatStoryItemDate,
  isJustNow,
  JUST_NOW_MS,
  thaiMonthLabel,
} from '@/lib/dates';

describe('story item date', () => {
  it('formats a Buddhist short date for the story-card slot', () => {
    expect(formatStoryItemDate('2026-10-03T00:00:00.000Z')).toBe('3 ต.ค. 2569');
  });

  it('treats timestamps within a minute as just now', () => {
    const now = Date.parse('2026-10-28T12:00:00.000Z');
    expect(isJustNow('2026-10-28T11:59:30.000Z', now)).toBe(true);
    expect(isJustNow(new Date(now - JUST_NOW_MS).toISOString(), now)).toBe(false);
    expect(isJustNow('2026-10-03T00:00:00.000Z', now)).toBe(false);
  });
});

describe('create-memory date parts', () => {
  it('omits a payload until a Buddhist year is chosen', () => {
    expect(eventDatePayload('', '', '')).toBeUndefined();
    expect(eventDatePayload('', '4', '12')).toBeUndefined();
  });

  it('sends January 1 with year precision when only the year is set', () => {
    expect(eventDatePayload('2539', '', '')).toEqual({
      occurred_from: '1996-01-01',
      date_precision: 'year',
    });
  });

  it('sends the first of the month with month precision', () => {
    expect(eventDatePayload('2540', '4', '')).toEqual({
      occurred_from: '1997-04-01',
      date_precision: 'month',
    });
  });

  it('sends a full day when year, month, and day are set', () => {
    expect(eventDatePayload('2540', '4', '12')).toEqual({
      occurred_from: '1997-04-12',
      date_precision: 'day',
    });
  });

  it('rejects a day that does not exist in that month', () => {
    expect(eventDatePayload('2569', '2', '31')).toBeUndefined();
    expect(daysInCalendarMonth('2567', '2')).toBe(29);
    expect(daysInCalendarMonth('2568', '2')).toBe(28);
  });

  it('lists Buddhist years from the current Bangkok year down to 2400', () => {
    const now = new Date('2026-10-28T00:00:00.000Z');
    expect(currentBuddhistYear(now)).toBe(2569);
    const years = buddhistYearOptions(now);
    expect(years[0]).toBe(2569);
    expect(years[years.length - 1]).toBe(2400);
    expect(thaiMonthLabel(4)).toBe('เมษายน');
  });
});
