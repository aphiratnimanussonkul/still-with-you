import { describe, expect, it } from 'vitest';
import { formatStoryItemDate, isJustNow, JUST_NOW_MS } from '@/lib/dates';

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
