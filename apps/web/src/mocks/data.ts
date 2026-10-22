import type { AccountResponse, EventResponse, FamilyResponse } from '@still-with-you/contracts';
import type { ContributionItem, FamilyMember, FamilyPerson, TrashItem } from '@/lib/family-graph';

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
  {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'บ้านคุณยาย',
    created_by: mockAccount.id,
    created_at: '2026-10-05T00:00:00.000Z',
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

export const mockPeople: FamilyPerson[] = [
  {
    id: '77777777-7777-4777-8777-777777777777',
    family_id: mockFamilies[0].id,
    display_name: 'ยายสมศรี',
    name: 'ยายสมศรี',
    family_name: null,
    gender: 'female',
    birth_date: '1948-08-01',
    bio: null,
    avatar_media_id: null,
    avatar_url: null,
    relation_label: 'ยาย',
    account_id: null,
    created_by_account_id: mockAccount.id,
    updated_at: '2026-10-03T00:00:00.000Z',
  },
  {
    id: '87878787-8787-4878-8878-878787878787',
    family_id: mockFamilies[0].id,
    display_name: 'ปู่สมชาย',
    name: 'ปู่สมชาย',
    family_name: null,
    gender: 'male',
    birth_date: null,
    bio: null,
    avatar_media_id: null,
    avatar_url: null,
    relation_label: 'ปู่',
    account_id: null,
    created_by_account_id: mockAccount.id,
    updated_at: '2026-10-03T00:00:00.000Z',
  },
];

export const mockMembers: FamilyMember[] = [
  {
    account_id: mockAccount.id,
    family_id: mockFamilies[0].id,
    role: 'admin',
    display_name: mockAccount.display_name,
    joined_at: '2026-10-02T00:00:00.000Z',
  },
  {
    account_id: mockAccount.id,
    family_id: mockFamilies[1].id,
    role: 'admin',
    display_name: mockAccount.display_name,
    joined_at: '2026-10-05T00:00:00.000Z',
  },
];

export const mockContributions: ContributionItem[] = [
  {
    id: '88888888-8888-4888-8888-888888888888',
    event_id: mockEvents[0].id,
    owner_account_id: mockAccount.id,
    owner_display_name: mockAccount.display_name,
    story: 'จำได้ว่าทะเลเงียบ',
    created_at: '2026-10-03T00:00:00.000Z',
  },
];

export const mockTrash: TrashItem[] = [
  {
    id: '99999999-9999-4999-8999-999999999999',
    story: 'เรื่องที่ย้ายไปถังขยะ',
    origin_event_title: 'วันเกิดยาย',
    family_name: mockFamilies[1].name,
    family_id: mockFamilies[1].id,
    trashed_at: '2026-10-12T00:00:00.000Z',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    story: 'เรื่องจากบ้านเรา',
    origin_event_title: 'ทริปทะเลกับคุณยาย',
    family_name: mockFamilies[0].name,
    family_id: mockFamilies[0].id,
    trashed_at: '2026-10-11T00:00:00.000Z',
  },
];

export const mockFocusIds: Record<string, string[]> = {
  [mockFamilies[0].id]: [mockPeople[0].id, mockPeople[1].id],
  [mockFamilies[1].id]: [],
};
