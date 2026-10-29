import type {
  AccountResponse,
  EventResponse,
  FamilyResponse,
  NotificationResponse,
} from '@still-with-you/contracts';
import type { ContributionItem, FamilyMember, FamilyPerson, FamilyRelationship, TrashItem } from '@/lib/family-graph';

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
    creator_display_name: mockAccount.display_name,
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
    paused: false,
    cover_url: null,
    cover_url_expires_at: null,
    cover_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    family_id: mockFamilies[0].id,
    creator_account_id: mockAccount.id,
    creator_display_name: mockAccount.display_name,
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
    paused: true,
    cover_url: null,
    cover_url_expires_at: null,
    cover_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
  },
];

export const mockMePersonId = '55555555-5555-4555-8555-555555555555';

export const mockPeople: FamilyPerson[] = [
  {
    id: '77777777-7777-4777-8777-777777777777',
    family_id: mockFamilies[0].id,
    display_name: 'ยายสมศรี',
    name: 'ยายสมศรี',
    relation_label: 'ยาย',
    account_id: null,
    is_living: false,
    birth_date: '1937-08-01',
    birth_date_precision: 'day',
    death_date: '2022-01-01',
    death_date_precision: 'year',
    age: 84,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 2,
  },
  {
    id: '87878787-8787-4878-8878-878787878787',
    family_id: mockFamilies[0].id,
    display_name: 'ปู่สมชาย',
    name: 'ปู่สมชาย',
    relation_label: 'ปู่',
    account_id: null,
    is_living: true,
    birth_date: '1935-01-01',
    birth_date_precision: 'year',
    death_date: null,
    death_date_precision: null,
    age: 91,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 0,
  },
  {
    id: mockMePersonId,
    family_id: mockFamilies[0].id,
    display_name: mockAccount.display_name,
    name: mockAccount.display_name,
    account_id: mockAccount.id,
    is_living: true,
    birth_date: '1990-03-01',
    birth_date_precision: 'day',
    death_date: null,
    death_date_precision: null,
    age: 36,
    avatar_url: null,
    avatar_url_expires_at: null,
    avatar_placeholder: null,
    full_url: null,
    full_url_expires_at: null,
    memory_count: 1,
  },
];

export const mockRelationships: FamilyRelationship[] = [
  {
    id: '12121212-1212-4121-8121-121212121212',
    family_id: mockFamilies[0].id,
    person_id: mockPeople[1].id,
    related_person_id: mockPeople[0].id,
    type: 'spouse',
    created_by_account_id: mockAccount.id,
    created_at: '2026-10-06T00:00:00.000Z',
  },
  {
    id: '13131313-1313-4131-8131-131313131313',
    family_id: mockFamilies[0].id,
    person_id: mockPeople[0].id,
    related_person_id: mockMePersonId,
    type: 'parent',
    created_by_account_id: mockAccount.id,
    created_at: '2026-10-06T00:00:00.000Z',
  },
  {
    id: '14141414-1414-4141-8141-141414141414',
    family_id: mockFamilies[0].id,
    person_id: mockPeople[1].id,
    related_person_id: mockMePersonId,
    type: 'parent',
    created_by_account_id: mockAccount.id,
    created_at: '2026-10-06T00:00:00.000Z',
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
    author_id: mockAccount.id,
    is_mine: true,
    owner_display_name: mockAccount.display_name,
    story: 'จำได้ว่าทะเลเงียบ',
    created_at: '2026-10-03T00:00:00.000Z',
    media: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        url: 'https://cdn.example.com/sea.jpg',
        thumb_url: null,
        status: 'ready',
      },
    ],
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

export const mockNotifications: NotificationResponse[] = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    type: 'contribution_added',
    payload: {
      actor_display_name: 'Mint',
      event_title: 'ทริปทะเลกับคุณยาย',
      event_id: mockEvents[0].id,
      family_id: mockFamilies[0].id,
    },
    created_at: '2026-10-22T08:00:00.000Z',
    read_at: null,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    type: 'invite_accepted',
    payload: {
      actor_display_name: 'Mae',
      family_name: mockFamilies[0].name,
      family_id: mockFamilies[0].id,
      person_id: mockPeople[0].id,
      person_display_name: mockPeople[0].display_name,
    },
    created_at: '2026-10-21T08:00:00.000Z',
    read_at: null,
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    type: 'contribution_added',
    payload: {
      actor_display_name: 'Mint',
      event_title: 'วันเกิดยาย',
      event_id: mockEvents[1].id,
      family_id: mockFamilies[0].id,
    },
    created_at: '2026-10-20T08:00:00.000Z',
    read_at: '2026-10-20T09:00:00.000Z',
  },
];
