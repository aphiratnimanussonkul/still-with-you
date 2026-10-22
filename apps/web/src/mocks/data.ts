import type { AccountResponse, EventResponse, FamilyResponse } from '@still-with-you/contracts';

export const mockAccount: AccountResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'atta@example.com',
  display_name: 'Atta',
  marketing_consent: false,
  marketing_consent_at: null,
  consent_answered_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
};

export const mockFamilies: FamilyResponse[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'บ้านเรา',
    created_by: mockAccount.id,
    created_at: '2026-10-02T00:00:00.000Z',
  },
];

export const mockEvents: EventResponse[] = [
  {
    id: '33333333-3333-4333-8333-333333333333',
    family_id: mockFamilies[0].id,
    creator_account_id: mockAccount.id,
    title: 'ทริปทะเลกับคุณยาย',
    description: null,
    occurred_from: '2018-04-12',
    occurred_to: null,
    date_precision: null,
    location: 'หัวหิน',
    status: 'active',
    archived_at: null,
    deletable_at: null,
    deleted_at: null,
    created_at: '2026-10-03T00:00:00.000Z',
    updated_at: '2026-10-03T00:00:00.000Z',
    version: 1,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    family_id: mockFamilies[0].id,
    creator_account_id: mockAccount.id,
    title: 'วันเกิดยาย',
    description: null,
    occurred_from: '2015-08-01',
    occurred_to: null,
    date_precision: null,
    location: null,
    status: 'archived',
    archived_at: '2026-10-10T00:00:00.000Z',
    deletable_at: '2026-10-17T00:00:00.000Z',
    deleted_at: null,
    created_at: '2026-10-04T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
    version: 2,
  },
];
