import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers } from '../lib/db/index.js';

describe('GET /v1/people/:id/events', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let other: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let otherToken: string;
  let outsiderToken: string;
  let familyId: string;
  let personId: string;
  let otherPersonId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createEvent(token: string, title: string, personIds: string[]) {
    return server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(token),
      payload: { title, story: `เรื่อง${title}`, person_ids: personIds },
    });
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('pe-steward', 'pe-steward@example.com', 'Steward');
    creator = await createTestAccount('pe-creator', 'pe-creator@example.com', 'Creator');
    other = await createTestAccount('pe-other', 'pe-other@example.com', 'Other');
    outsider = await createTestAccount('pe-out', 'pe-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);
    otherToken = await generateTestToken(other.authId, other.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'Events Family' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: creator.id, role: 'member' },
      { familyId, accountId: other.id, role: 'member' },
    ]);

    const personRes = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(creatorToken),
      payload: { name: 'ยาย' },
    });
    personId = JSON.parse(personRes.body).id;
    const otherPersonRes = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(creatorToken),
      payload: { name: 'ตา' },
    });
    otherPersonId = JSON.parse(otherPersonRes.body).id;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('lists only events linked to that person for family members', async () => {
    const linked = await createEvent(creatorToken, 'วันเกิดยาย', [personId]);
    expect(linked.statusCode).toBe(201);
    const otherEvent = await createEvent(creatorToken, 'วันเกิดตา', [otherPersonId]);
    expect(otherEvent.statusCode).toBe(201);
    const unlinked = await createEvent(creatorToken, 'ไม่มีใคร', []);
    expect(unlinked.statusCode).toBe(201);

    const list = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(otherToken),
    });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body);
    expect(body.events.map((event: { title: string }) => event.title)).toEqual(['วันเกิดยาย']);
    expect(body.next_cursor).toBeNull();
  });

  it('hides archived events from other members; creator and steward still see them', async () => {
    const created = await createEvent(creatorToken, 'เรื่องเก่า', [personId]);
    const eventId = JSON.parse(created.body).id;
    const archived = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/archive`,
      headers: await auth(creatorToken),
    });
    expect(archived.statusCode).toBe(200);

    const asOther = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(otherToken),
    });
    expect(JSON.parse(asOther.body).events).toHaveLength(0);

    const asCreator = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(creatorToken),
    });
    expect(JSON.parse(asCreator.body).events).toHaveLength(1);
    expect(JSON.parse(asCreator.body).events[0].status).toBe('archived');

    const asSteward = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(stewardToken),
    });
    expect(JSON.parse(asSteward.body).events).toHaveLength(1);
  });

  it('paginates with cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      const created = await createEvent(creatorToken, `เรื่อง ${i}`, [personId]);
      expect(created.statusCode).toBe(201);
    }

    const first = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events?limit=2`,
      headers: await auth(otherToken),
    });
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.events).toHaveLength(2);
    expect(firstBody.next_cursor).toBeTruthy();

    const second = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events?limit=2&cursor=${encodeURIComponent(firstBody.next_cursor)}`,
      headers: await auth(otherToken),
    });
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.events).toHaveLength(1);
    expect(secondBody.next_cursor).toBeNull();
    const ids = [...firstBody.events, ...secondBody.events].map((event: { id: string }) => event.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('returns 404 for outsiders and missing people', async () => {
    const outsiderList = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(outsiderToken),
    });
    expect(outsiderList.statusCode).toBe(404);

    const missing = await server.inject({
      method: 'GET',
      url: `/v1/people/00000000-0000-4000-a000-000000000099/events`,
      headers: await auth(stewardToken),
    });
    expect(missing.statusCode).toBe(404);
  });
});
