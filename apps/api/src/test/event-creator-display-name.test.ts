import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventResponseSchema } from '@still-with-you/contracts';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, accounts, familyMembers } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';

describe('event creator_display_name', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let familyId: string;
  let personId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createEvent(title = 'วันเกิดยาย') {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title, story: 'เรื่องราววันนั้น', person_ids: [personId] },
    });
    expect(response.statusCode).toBe(201);
    return eventResponseSchema.parse(JSON.parse(response.body));
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('cdn-steward', 'cdn-steward@example.com', 'Steward');
    creator = await createTestAccount('cdn-creator', 'cdn-creator@example.com', 'Creator');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);

    const family = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'Creator Name Family' },
    });
    expect(family.statusCode).toBe(201);
    familyId = JSON.parse(family.body).id as string;
    await db.insert(familyMembers).values({ familyId, accountId: creator.id, role: 'member' });

    const person = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(creatorToken),
      payload: { name: 'ยาย' },
    });
    expect(person.statusCode).toBe(201);
    personId = JSON.parse(person.body).person.id as string;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('returns the current accounts.display_name on create, GET, list, people list, PATCH, archive, unarchive, and home', async () => {
    const created = await createEvent();
    expect(created.creator_account_id).toBe(creator.id);
    expect(created.creator_display_name).toBe('Creator');

    const got = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: await auth(stewardToken),
    });
    expect(got.statusCode).toBe(200);
    expect(eventResponseSchema.parse(JSON.parse(got.body)).creator_display_name).toBe('Creator');

    const familyList = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(stewardToken),
    });
    expect(familyList.statusCode).toBe(200);
    const listed = JSON.parse(familyList.body).events.map((row: unknown) => eventResponseSchema.parse(row));
    expect(listed).toHaveLength(1);
    expect(listed[0].creator_display_name).toBe('Creator');

    const peopleList = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}/events`,
      headers: await auth(stewardToken),
    });
    expect(peopleList.statusCode).toBe(200);
    const peopleEvents = JSON.parse(peopleList.body).events.map((row: unknown) => eventResponseSchema.parse(row));
    expect(peopleEvents).toHaveLength(1);
    expect(peopleEvents[0].creator_display_name).toBe('Creator');

    const patched = await server.inject({
      method: 'PATCH',
      url: `/v1/events/${created.id}`,
      headers: await auth(creatorToken),
      payload: { title: 'หัวข้อใหม่', version: created.version },
    });
    expect(patched.statusCode).toBe(200);
    expect(eventResponseSchema.parse(JSON.parse(patched.body)).creator_display_name).toBe('Creator');

    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(stewardToken),
    });
    expect(home.statusCode).toBe(200);
    const memories = JSON.parse(home.body).recent_memories.map((row: unknown) => eventResponseSchema.parse(row));
    expect(memories).toHaveLength(1);
    expect(memories[0].creator_display_name).toBe('Creator');

    const archived = await server.inject({
      method: 'POST',
      url: `/v1/events/${created.id}/archive`,
      headers: await auth(creatorToken),
    });
    expect(archived.statusCode).toBe(200);
    expect(eventResponseSchema.parse(JSON.parse(archived.body)).creator_display_name).toBe('Creator');

    const unarchived = await server.inject({
      method: 'POST',
      url: `/v1/events/${created.id}/unarchive`,
      headers: await auth(creatorToken),
    });
    expect(unarchived.statusCode).toBe(200);
    expect(eventResponseSchema.parse(JSON.parse(unarchived.body)).creator_display_name).toBe('Creator');
  });

  it('uses the current account display name after a rename', async () => {
    const created = await createEvent();
    await db.update(accounts).set({ displayName: 'ชื่อใหม่' }).where(eq(accounts.id, creator.id));

    const got = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: await auth(creatorToken),
    });
    expect(eventResponseSchema.parse(JSON.parse(got.body)).creator_display_name).toBe('ชื่อใหม่');

    const familyList = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(stewardToken),
    });
    expect(eventResponseSchema.parse(JSON.parse(familyList.body).events[0]).creator_display_name).toBe('ชื่อใหม่');
  });

  it('does not put an editor name on 409 EVENT_EDIT_CONFLICT details', async () => {
    const created = await createEvent();
    const first = await server.inject({
      method: 'PATCH',
      url: `/v1/events/${created.id}`,
      headers: await auth(creatorToken),
      payload: { title: 'รอบแรก', version: created.version },
    });
    expect(first.statusCode).toBe(200);

    const stale = await server.inject({
      method: 'PATCH',
      url: `/v1/events/${created.id}`,
      headers: await auth(creatorToken),
      payload: { title: 'ไม่ควรชนะ', version: created.version },
    });
    expect(stale.statusCode).toBe(409);
    const error = JSON.parse(stale.body).error;
    expect(error.code).toBe('EVENT_EDIT_CONFLICT');
    expect(error.details).toEqual({
      current_version: eventResponseSchema.parse(JSON.parse(first.body)).version,
    });
    expect(error.details).not.toHaveProperty('editor');
    expect(error.details).not.toHaveProperty('editor_display_name');
    expect(error.details).not.toHaveProperty('creator_display_name');
    expect(JSON.stringify(error)).not.toMatch(/Steward|Creator|display_name/);
  });
});
