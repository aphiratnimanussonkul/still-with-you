import { describe, expect, it } from 'vitest';
import type { AccountResponse } from '@still-with-you/contracts';
import { isFirstUse } from '@/hooks/use-me';

const base: AccountResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'atta@example.com',
  display_name: 'Atta',
  marketing_consent: false,
  marketing_consent_at: null,
  consent_answered_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

describe('isFirstUse', () => {
  it('is true only while consent_answered_at is null', () => {
    expect(isFirstUse(base)).toBe(true);
    expect(
      isFirstUse({
        ...base,
        marketing_consent: false,
        marketing_consent_at: null,
        consent_answered_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false);
  });
});
