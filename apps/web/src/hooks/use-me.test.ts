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
  it('requires consent only when consent_answered_at is null', () => {
    expect(isFirstUse(base)).toBe(true);
    expect(isFirstUse({ ...base, consent_answered_at: '2026-10-22T00:00:00.000Z' })).toBe(false);
  });

  it('treats declined marketing as answered once consent_answered_at is set', () => {
    expect(
      isFirstUse({
        ...base,
        marketing_consent: false,
        marketing_consent_at: null,
        consent_answered_at: '2026-01-01T00:00:00.000Z',
      })
    ).toBe(false);
  });

  it('does not lock users out when the new field is omitted (old API)', () => {
    const legacy = {
      id: base.id,
      email: base.email,
      display_name: base.display_name,
      marketing_consent: false,
      marketing_consent_at: null,
      created_at: base.created_at,
    } as AccountResponse;
    expect(isFirstUse(legacy)).toBe(false);
    expect(isFirstUse({ ...legacy, marketing_consent: true })).toBe(false);
  });

  it('falls back to unanswered only when marketing_consent is null on a legacy payload', () => {
    expect(
      isFirstUse({
        ...base,
        marketing_consent: null as unknown as boolean,
      })
    ).toBe(true);
  });
});
