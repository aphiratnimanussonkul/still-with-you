import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, notifications } from '../lib/db/index.js';
import { NotificationType } from '../lib/notifications.js';
import { contributionAddedPayloadSchema } from '@still-with-you/contracts';

describe('archived event visibility (creator only)', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let owner: Awaited<ReturnType<typeof createTestAccount>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let contributor: Awaited<ReturnType<typeof createTestAccount>>;
  let ownerToken: string;
  let stewardToken: string;
  let memberToken: string;
  let contributorToken: string;
  let familyId: string;
  let personId: string;
  let eventId: string;
  let ownerStoryId: string;
  let contributorStoryId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function get(url: string, token: string) {
    return server.inject({ method: 'GET', url, headers: await auth(token) });
  }

  async function post(url: string, token: string, payload?: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url,
      headers: await auth(token),
      ...(payload ? { payload } : {}),
    });
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('av-steward', 'av-steward@example.com', 'Steward');
    owner = await createTestAccount('av-owner', 'av-owner@example.com', 'Owner');
    member = await createTestAccount('av-member', 'av-member@example.com', 'Member');
    contributor = await createTestAccount('av-contrib', 'av-contrib@example.com', 'Contributor');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    ownerToken = await generateTestToken(owner.authId, owner.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    contributorToken = await generateTestToken(contributor.authId, contributor.email!);

    const familyRes = await post('/v1/families', stewardToken, { name: 'Visibility Family' });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: owner.id, role: 'member' },
      { familyId, accountId: member.id, role: 'member' },
      { familyId, accountId: contributor.id, role: 'member' },
    ]);

    const personRes = await post(`/v1/families/${familyId}/people`, stewardToken, { name: 'ยาย' });
    personId = JSON.parse(personRes.body).person.id;

    const created = await post(`/v1/families/${familyId}/events`, ownerToken, {
      title: 'วันเกิดยาย',
      story: 'เรื่องของเจ้าของ',
      person_ids: [personId],
    });
    expect(created.statusCode).toBe(201);
    eventId = JSON.parse(created.body).id;

    const stories = await get(`/v1/events/${eventId}/contributions`, ownerToken);
    ownerStoryId = JSON.parse(stories.body).contributions[0].id;

    const added = await post(`/v1/events/${eventId}/contributions`, contributorToken, {
      story: 'เรื่องของผู้ร่วมเล่า',
    });
    expect(added.statusCode).toBe(201);
    contributorStoryId = JSON.parse(added.body).id;

    const archived = await post(`/v1/events/${eventId}/archive`, ownerToken);
    expect(archived.statusCode).toBe(200);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('returns event detail and unarchive only for the creator; others get 404', async () => {
    const asOwner = await get(`/v1/events/${eventId}`, ownerToken);
    expect(asOwner.statusCode).toBe(200);
    expect(JSON.parse(asOwner.body).status).toBe('archived');
    expect(JSON.parse(asOwner.body).title).toBe('วันเกิดยาย');

    for (const token of [stewardToken, memberToken, contributorToken]) {
      const detail = await get(`/v1/events/${eventId}`, token);
      expect(detail.statusCode).toBe(404);
      expect(JSON.parse(detail.body).error.code).toBe('NOT_FOUND');

      const unarchive = await post(`/v1/events/${eventId}/unarchive`, token);
      expect(unarchive.statusCode).toBe(404);
    }

    const restored = await post(`/v1/events/${eventId}/unarchive`, ownerToken);
    expect(restored.statusCode).toBe(200);
    expect(JSON.parse(restored.body).status).toBe('active');
  });

  it('omits other people\'s archived events from lists, memory_count, and home', async () => {
    const roles = [
      { token: ownerToken, seesEvent: true, memoryCount: 1 },
      { token: stewardToken, seesEvent: false, memoryCount: 0 },
      { token: memberToken, seesEvent: false, memoryCount: 0 },
      { token: contributorToken, seesEvent: false, memoryCount: 0 },
    ];

    for (const role of roles) {
      const familyEvents = await get(`/v1/families/${familyId}/events`, role.token);
      expect(familyEvents.statusCode).toBe(200);
      const listed = JSON.parse(familyEvents.body).events as { id: string }[];
      expect(listed.some((event) => event.id === eventId)).toBe(role.seesEvent);

      const personEvents = await get(`/v1/people/${personId}/events`, role.token);
      expect(personEvents.statusCode).toBe(200);
      expect(JSON.parse(personEvents.body).events).toHaveLength(role.seesEvent ? 1 : 0);

      const people = await get(`/v1/families/${familyId}/people`, role.token);
      const grandma = JSON.parse(people.body).people.find((row: { id: string }) => row.id === personId);
      expect(grandma.memory_count).toBe(role.memoryCount);

      const person = await get(`/v1/people/${personId}`, role.token);
      expect(JSON.parse(person.body).memory_count).toBe(role.memoryCount);

      await server.inject({
        method: 'PUT',
        url: `/v1/families/${familyId}/focus`,
        headers: await auth(role.token),
        payload: { person_ids: [personId] },
      });
      const home = await get(`/v1/families/${familyId}/home`, role.token);
      expect(home.statusCode).toBe(200);
      const body = JSON.parse(home.body);
      expect(body.recent_memories).toEqual([]);
      expect(body.focus[0].memory_count).toBe(role.memoryCount);
    }
  });

  it('hides every contribution in an archived event from steward, member, and the contributor', async () => {
    const asOwnerList = await get(`/v1/events/${eventId}/contributions`, ownerToken);
    expect(asOwnerList.statusCode).toBe(200);
    expect(JSON.parse(asOwnerList.body).contributions).toHaveLength(2);

    const asOwnerOwn = await get(`/v1/contributions/${ownerStoryId}`, ownerToken);
    expect(asOwnerOwn.statusCode).toBe(200);
    const asOwnerOther = await get(`/v1/contributions/${contributorStoryId}`, ownerToken);
    expect(asOwnerOther.statusCode).toBe(200);
    expect(JSON.parse(asOwnerOther.body).origin_event_title_snapshot).toBe('วันเกิดยาย');

    for (const token of [stewardToken, memberToken, contributorToken]) {
      const list = await get(`/v1/events/${eventId}/contributions`, token);
      expect(list.statusCode).toBe(404);

      const ownOrOther = await get(`/v1/contributions/${contributorStoryId}`, token);
      expect(ownOrOther.statusCode).toBe(404);
      expect(JSON.parse(ownOrOther.body).error.code).toBe('NOT_FOUND');

      const ownerStory = await get(`/v1/contributions/${ownerStoryId}`, token);
      expect(ownerStory.statusCode).toBe(404);

      const patch = await server.inject({
        method: 'PATCH',
        url: `/v1/contributions/${contributorStoryId}`,
        headers: await auth(token),
        payload: { story: 'ไม่ควรได้' },
      });
      expect(patch.statusCode).toBe(404);
    }
  });

  it('does not leak an archived event title on notifications', async () => {
    const payload = {
      actor_display_name: 'Contributor',
      event_title: 'วันเกิดยาย',
      event_id: eventId,
      family_id: familyId,
    };
    await db.insert(notifications).values([
      { accountId: owner.id, type: NotificationType.CONTRIBUTION_ADDED, payload },
      { accountId: steward.id, type: NotificationType.CONTRIBUTION_ADDED, payload },
      { accountId: member.id, type: NotificationType.CONTRIBUTION_ADDED, payload },
      { accountId: contributor.id, type: NotificationType.CONTRIBUTION_ADDED, payload },
    ]);

    const asOwner = await get('/v1/me/notifications', ownerToken);
    const ownerItems = JSON.parse(asOwner.body).notifications as Array<{
      payload: { event_title: string | null; event_id: string };
    }>;
    expect(ownerItems.some((row) => row.payload.event_id === eventId && row.payload.event_title === 'วันเกิดยาย')).toBe(
      true
    );

    for (const token of [stewardToken, memberToken, contributorToken]) {
      const listed = await get('/v1/me/notifications', token);
      expect(listed.statusCode).toBe(200);
      expect(JSON.parse(listed.body).notifications).toHaveLength(1);
      const payload = contributionAddedPayloadSchema.parse(JSON.parse(listed.body).notifications[0].payload);
      expect(payload.event_title).toBeNull();
      expect(payload.event_id).toBe(eventId);
      expect(payload).toEqual({
        actor_display_name: 'Contributor',
        event_title: null,
        event_id: eventId,
        family_id: familyId,
      });
    }
  });
});
