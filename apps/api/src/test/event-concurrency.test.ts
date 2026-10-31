import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventPatchVersionMessage, eventResponseSchema } from '@still-with-you/contracts';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers } from '../lib/db/index.js';

describe('PATCH /v1/events/:id optimistic concurrency', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let familyId: string;

  async function createEvent(title = 'วันเกิดยาย') {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: { authorization: `Bearer ${creatorToken}` },
      payload: { title, story: 'เรื่องราววันนั้น' },
    });
    expect(response.statusCode).toBe(201);
    return eventResponseSchema.parse(JSON.parse(response.body));
  }

  async function patchEvent(id: string, payload: Record<string, unknown>, token = creatorToken) {
    return server.inject({
      method: 'PATCH',
      url: `/v1/events/${id}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('auth-steward-cas', 'steward-cas@example.com', 'Steward');
    creator = await createTestAccount('auth-creator-cas', 'creator-cas@example.com', 'Creator');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);

    const family = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: { authorization: `Bearer ${stewardToken}` },
      payload: { name: 'CAS Family' },
    });
    expect(family.statusCode).toBe(201);
    familyId = JSON.parse(family.body).id as string;
    await db.insert(familyMembers).values({ familyId, accountId: creator.id, role: 'member' });
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('returns version 1 on GET/create', async () => {
    const created = await createEvent();
    expect(created.version).toBe(1);

    const got = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(eventResponseSchema.parse(JSON.parse(got.body)).version).toBe(1);
  });

  it('returns 400 INVALID_INPUT with field version when PATCH omits version', async () => {
    const created = await createEvent();
    const patched = await patchEvent(created.id, { title: 'หัวข้อใหม่' });
    expect(patched.statusCode).toBe(400);
    expect(JSON.parse(patched.body).error).toEqual({
      code: 'INVALID_INPUT',
      message: eventPatchVersionMessage,
      field: 'version',
    });
    const still = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(eventResponseSchema.parse(JSON.parse(still.body)).title).toBe('วันเกิดยาย');
    expect(eventResponseSchema.parse(JSON.parse(still.body)).version).toBe(1);
  });

  it('returns 400 INVALID_INPUT with field version when PATCH version is not an integer', async () => {
    const created = await createEvent();
    const patched = await patchEvent(created.id, { title: 'หัวข้อใหม่', version: '1' });
    expect(patched.statusCode).toBe(400);
    expect(JSON.parse(patched.body).error).toEqual({
      code: 'INVALID_INPUT',
      message: eventPatchVersionMessage,
      field: 'version',
    });
    const still = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(eventResponseSchema.parse(JSON.parse(still.body)).version).toBe(1);
  });

  it('succeeds when body.version matches and returns the incremented version', async () => {
    const created = await createEvent();
    const patched = await patchEvent(created.id, { title: 'ตรงเวอร์ชัน', version: created.version });
    expect(patched.statusCode).toBe(200);
    const body = eventResponseSchema.parse(JSON.parse(patched.body));
    expect(body.title).toBe('ตรงเวอร์ชัน');
    expect(body.version).toBe(created.version + 1);
  });

  it('returns 409 EVENT_EDIT_CONFLICT with details.current_version on mismatch and no editor name', async () => {
    const created = await createEvent();
    const first = await patchEvent(created.id, { title: 'แก้รอบแรก', version: created.version });
    expect(first.statusCode).toBe(200);
    const current = eventResponseSchema.parse(JSON.parse(first.body));

    const stale = await patchEvent(created.id, { title: 'ไม่ควรชนะ', version: created.version });
    expect(stale.statusCode).toBe(409);
    const error = JSON.parse(stale.body).error;
    expect(error.code).toBe('EVENT_EDIT_CONFLICT');
    expect(error.details).toEqual({ current_version: current.version });
    expect(error.details).not.toHaveProperty('editor');
    expect(error.details).not.toHaveProperty('editor_display_name');
    expect(JSON.stringify(error)).not.toMatch(/Steward|Creator|display_name/);

    const still = await server.inject({
      method: 'GET',
      url: `/v1/events/${created.id}`,
      headers: { authorization: `Bearer ${creatorToken}` },
    });
    expect(eventResponseSchema.parse(JSON.parse(still.body)).title).toBe('แก้รอบแรก');
  });

  it('lets only one of two concurrent PATCHes with the same version succeed', async () => {
    const created = await createEvent();
    const [left, right] = await Promise.all([
      patchEvent(created.id, { title: 'ซ้าย', version: created.version }),
      patchEvent(created.id, { title: 'ขวา', version: created.version }),
    ]);
    const statuses = [left.statusCode, right.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = left.statusCode === 200 ? left : right;
    const loser = left.statusCode === 409 ? left : right;
    const won = eventResponseSchema.parse(JSON.parse(winner.body));
    expect(won.version).toBe(created.version + 1);
    expect(['ซ้าย', 'ขวา']).toContain(won.title);

    const conflict = JSON.parse(loser.body).error;
    expect(conflict.code).toBe('EVENT_EDIT_CONFLICT');
    expect(conflict.details).toEqual({ current_version: won.version });
  });
});
