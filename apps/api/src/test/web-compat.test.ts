import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, contributions, sql as pgSql } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { contributionResponseSchema, meTrashListResponseSchema } from '@still-with-you/contracts';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000001';

describe('Web-compat routes (contributions list, people, envelope, api-client)', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let familyId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('auth-web-steward', 'web-steward@example.com', 'Steward');
    member = await createTestAccount('auth-web-member', 'web-member@example.com', 'Member');
    outsider = await createTestAccount('auth-web-out', 'web-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านเรา' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values({ familyId, accountId: member.id, role: 'member' });
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('GET /v1/events/:id/contributions', () => {
    it('lists published contributions for a member, newest first, excluding trash', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'ทริปทะเล', story: 'เรื่องแรก' },
      });
      expect(created.statusCode).toBe(201);
      const eventId = JSON.parse(created.body).id;

      const second = await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'เรื่องสอง' },
      });
      expect(second.statusCode).toBe(201);
      const secondId = JSON.parse(second.body).id;

      const trashed = await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'เรื่องถังขยะ' },
      });
      const trashedId = JSON.parse(trashed.body).id;
      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${trashedId}/trash`,
        headers: await auth(memberToken),
      });

      const listed = await server.inject({
        method: 'GET',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      const body = JSON.parse(listed.body);
      expect(body.contributions.map((row: { story: string }) => row.story)).toEqual(['เรื่องสอง', 'เรื่องแรก']);
      expect(body.contributions.find((row: { id: string }) => row.id === trashedId)).toBeUndefined();

      const newest = contributionResponseSchema.parse(body.contributions[0]);
      expect(newest.id).toBe(secondId);
      expect(newest.owner_account_id).toBe(member.id);
      expect(newest.author_id).toBe(member.id);
      expect(newest.is_mine).toBe(true);
      expect(newest.media).toEqual([]);
      expect(body.contributions[1].owner_account_id).toBe(steward.id);
      expect(body.contributions[1].author_id).toBe(steward.id);
      expect(body.contributions[1].is_mine).toBe(false);
      expect(body.contributions[1].owner_display_name).toBe('Steward');
    });

    it('returns 404 NOT_FOUND for a non-member', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'ลับ', story: 'ในบ้าน' },
      });
      const eventId = JSON.parse(created.body).id;

      const response = await server.inject({
        method: 'GET',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(outsiderToken),
      });
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when the event is missing or deleted', async () => {
      const missing = await server.inject({
        method: 'GET',
        url: `/v1/events/${UNKNOWN_UUID}/contributions`,
        headers: await auth(memberToken),
      });
      expect(missing.statusCode).toBe(404);
      expect(JSON.parse(missing.body).error.code).toBe('NOT_FOUND');
    });
  });

  describe('people routes', () => {
    it('lists and creates people in the web mock shape; GET by id for members only', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(stewardToken),
        payload: { name: '  ยายสมศรี  ', relation_label: 'ยาย' },
      });
      expect(created.statusCode).toBe(201);
      const createdBody = JSON.parse(created.body);
      expect(createdBody.relationship).toBeNull();
      const person = createdBody.person;
      expect(person).toMatchObject({
        family_id: familyId,
        name: 'ยายสมศรี',
        relation_label: 'ยาย',
        account_id: null,
        is_living: true,
        death_date: null,
        death_date_precision: null,
      });
      expect(person.id).toBeTruthy();

      const listed = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      const listedBody = JSON.parse(listed.body);
      expect(listedBody.people).toHaveLength(1);
      expect(listedBody.people[0]).toMatchObject({
        id: person.id,
        family_id: familyId,
        name: 'ยายสมศรี',
        display_name: 'ยายสมศรี',
        relation_label: 'ยาย',
        account_id: null,
        invite_status: 'none',
      });
      expect(listedBody.relationships).toEqual([]);

      const one = await server.inject({
        method: 'GET',
        url: `/v1/people/${person.id}`,
        headers: await auth(stewardToken),
      });
      expect(one.statusCode).toBe(200);
      expect(JSON.parse(one.body)).toMatchObject({
        id: person.id,
        name: 'ยายสมศรี',
        relation_label: 'ยาย',
      });

      const hidden = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(outsiderToken),
      });
      expect(hidden.statusCode).toBe(404);
      expect(JSON.parse(hidden.body).error.code).toBe('NOT_FOUND');

      const hiddenOne = await server.inject({
        method: 'GET',
        url: `/v1/people/${person.id}`,
        headers: await auth(outsiderToken),
      });
      expect(hiddenOne.statusCode).toBe(404);
    });

    it('persists relation_label so a later GET list and GET by id return it', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(stewardToken),
        payload: { name: 'ปู่สมชาย', relation_label: 'ปู่' },
      });
      expect(created.statusCode).toBe(201);
      const id = JSON.parse(created.body).person.id;
      expect(JSON.parse(created.body).person.relation_label).toBe('ปู่');

      const listed = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      expect(JSON.parse(listed.body).people.find((row: { id: string }) => row.id === id).relation_label).toBe(
        'ปู่'
      );

      const one = await server.inject({
        method: 'GET',
        url: `/v1/people/${id}`,
        headers: await auth(memberToken),
      });
      expect(one.statusCode).toBe(200);
      expect(JSON.parse(one.body).relation_label).toBe('ปู่');
    });

    it('lists family members for a member and 404s outsiders', async () => {
      const listed = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/members`,
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      const members = JSON.parse(listed.body).members;
      expect(members).toHaveLength(2);
      expect(members.map((row: { account_id: string }) => row.account_id).sort()).toEqual(
        [steward.id, member.id].sort()
      );

      const hidden = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/members`,
        headers: await auth(outsiderToken),
      });
      expect(hidden.statusCode).toBe(404);
      expect(JSON.parse(hidden.body).error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /v1/me/trash', () => {
    it('returns the caller own restorable items, newest trashed first, web mock shape', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'วันเกิดยาย', story: 'เรื่องต้น' },
      });
      const eventId = JSON.parse(created.body).id;
      const [stewardStory] = await db.select().from(contributions).where(eq(contributions.eventId, eventId));

      const first = await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'เรื่องเก่า' },
      });
      const firstId = JSON.parse(first.body).id;
      const second = await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'เรื่องใหม่' },
      });
      const secondId = JSON.parse(second.body).id;

      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${firstId}/trash`,
        headers: await auth(memberToken),
      });
      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${secondId}/trash`,
        headers: await auth(memberToken),
      });

      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${stewardStory.id}/trash`,
        headers: await auth(stewardToken),
      });

      const listed = await server.inject({
        method: 'GET',
        url: '/v1/me/trash',
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      const body = meTrashListResponseSchema.parse(JSON.parse(listed.body));
      expect(body.items.map((row) => row.id)).toEqual([secondId, firstId]);
      expect(body.items[0]).toEqual({
        id: secondId,
        story: 'เรื่องใหม่',
        origin_event_title: 'วันเกิดยาย',
        family_name: 'บ้านเรา',
        family_id: familyId,
        trashed_at: body.items[0].trashed_at,
      });
      expect(body.items.find((row) => row.id === stewardStory.id)).toBeUndefined();
    });

    it('omits items whose origin is archived (not restorable) and items after leaving the family', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'ทริป', story: 'ต้นเรื่อง' },
      });
      const eventId = JSON.parse(created.body).id;
      const extra = await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'จะกู้ไม่ได้' },
      });
      const extraId = JSON.parse(extra.body).id;
      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${extraId}/trash`,
        headers: await auth(memberToken),
      });

      await server.inject({
        method: 'POST',
        url: `/v1/events/${eventId}/archive`,
        headers: await auth(stewardToken),
      });

      const afterArchive = await server.inject({
        method: 'GET',
        url: '/v1/me/trash',
        headers: await auth(memberToken),
      });
      expect(JSON.parse(afterArchive.body).items).toEqual([]);

      const otherEvent = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'ยังอยู่', story: 'ต้น' },
      });
      const keep = await server.inject({
        method: 'POST',
        url: `/v1/events/${JSON.parse(otherEvent.body).id}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'กู้ได้' },
      });
      const keepId = JSON.parse(keep.body).id;
      await server.inject({
        method: 'POST',
        url: `/v1/contributions/${keepId}/trash`,
        headers: await auth(memberToken),
      });

      const beforeLeave = await server.inject({
        method: 'GET',
        url: '/v1/me/trash',
        headers: await auth(memberToken),
      });
      expect(JSON.parse(beforeLeave.body).items.map((row: { id: string }) => row.id)).toEqual([keepId]);

      const left = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/leave`,
        headers: await auth(memberToken),
      });
      expect(left.statusCode).toBeLessThan(300);

      const afterLeave = await server.inject({
        method: 'GET',
        url: '/v1/me/trash',
        headers: await auth(memberToken),
      });
      expect(JSON.parse(afterLeave.body).items).toEqual([]);
    });

    it('falls back to created_at when trashed_at is null', async () => {
      const created = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'เรื่องเก่า', story: 'ต้น' },
      });
      const extra = await server.inject({
        method: 'POST',
        url: `/v1/events/${JSON.parse(created.body).id}/contributions`,
        headers: await auth(memberToken),
        payload: { story: 'legacy trash' },
      });
      const extraId = JSON.parse(extra.body).id;
      const [row] = await db.select().from(contributions).where(eq(contributions.id, extraId));

      await pgSql`ALTER TABLE contributions DISABLE TRIGGER validate_contribution_state`;
      try {
        await db
          .update(contributions)
          .set({ status: 'trashed', trashReason: 'owner', trashedAt: null })
          .where(eq(contributions.id, extraId));

        const listed = await server.inject({
          method: 'GET',
          url: '/v1/me/trash',
          headers: await auth(memberToken),
        });
        expect(listed.statusCode).toBe(200);
        const body = meTrashListResponseSchema.parse(JSON.parse(listed.body));
        expect(body.items).toHaveLength(1);
        expect(body.items[0].id).toBe(extraId);
        expect(body.items[0].trashed_at).toBe(row.createdAt.toISOString());
      } finally {
        await pgSql`ALTER TABLE contributions ENABLE TRIGGER validate_contribution_state`;
      }
    });
  });

  describe('NOT_FOUND envelope', () => {
    it('returns {error:{code:NOT_FOUND,message:Route not found}} for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/definitely-not-a-route',
        headers: await auth(memberToken),
      });
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({
        error: { code: 'NOT_FOUND', message: 'Route not found' },
      });
    });
  });

  describe('api-client.ts routes exist', () => {
    it('registers every path called from apps/web/src/lib/api-client.ts', async () => {
      const eventRes = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(stewardToken),
        payload: { title: 'มีเรื่อง', story: 'เนื้อเรื่อง' },
      });
      const event = JSON.parse(eventRes.body);
      const [story] = await db.select().from(contributions).where(eq(contributions.eventId, event.id));

      type Probe = { method: 'GET' | 'POST' | 'PATCH'; url: string; payload?: Record<string, unknown> };
      const probes: Probe[] = [
        { method: 'GET', url: '/v1/me' },
        { method: 'PATCH', url: '/v1/me/consent', payload: { marketing_consent: false } },
        { method: 'GET', url: '/v1/families' },
        { method: 'GET', url: `/v1/families/${familyId}` },
        { method: 'POST', url: '/v1/families', payload: { name: 'บ้านใหม่' } },
        { method: 'GET', url: `/v1/families/${familyId}/events` },
        { method: 'GET', url: `/v1/events/${event.id}` },
        { method: 'POST', url: `/v1/families/${familyId}/events`, payload: { title: 'อีกเรื่อง', story: 'เนื้อ' } },
        { method: 'POST', url: `/v1/events/${event.id}/contributions`, payload: { story: 'เพิ่มเรื่อง' } },
        { method: 'PATCH', url: `/v1/contributions/${story.id}`, payload: { story: 'แก้เรื่อง' } },
      ];

      const src = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '../../../web/src/lib/api-client.ts'),
        'utf8'
      );
      expect(src).toContain("request('/v1/me'");
      expect(src).toContain("request('/v1/me/consent'");
      expect(src).toContain("request('/v1/families'");
      expect(src).toContain('request(`/v1/families/${familyId}`');
      expect(src).toContain('request(`/v1/families/${familyId}/events`');
      expect(src).toContain('request(`/v1/events/${eventId}`');
      expect(src).toContain('request(`/v1/events/${eventId}/contributions`');
      expect(src).toContain('request(`/v1/contributions/${contributionId}`');

      for (const probe of probes) {
        const response = await server.inject({
          method: probe.method,
          url: probe.url,
          headers: await auth(memberToken),
          ...(probe.payload ? { payload: probe.payload } : {}),
        });
        const body = response.body ? JSON.parse(response.body) : null;
        expect(
          body?.error?.message,
          `${probe.method} ${probe.url} should not be an unknown route`
        ).not.toBe('Route not found');
        expect(response.statusCode).not.toBe(500);
      }
    });
  });
});
