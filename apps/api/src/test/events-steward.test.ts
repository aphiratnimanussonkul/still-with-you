import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, events, contributions } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { EVENT_DELETE_CONFIRM_TEXT } from '@still-with-you/contracts';

/**
 * AC-19..AC-27: family steward, archived_at, permanent delete, canManageEvent, story required
 */
describe('Event steward, archive, and contributions (AC-19..AC-27)', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let otherMember: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let otherToken: string;
  let familyId: string;

  async function createFamily() {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: { authorization: `Bearer ${stewardToken}` },
      payload: { name: 'Steward Family' },
    });
    expect(response.statusCode).toBe(201);
    const family = JSON.parse(response.body);
    await db.insert(familyMembers).values([
      { familyId: family.id, accountId: creator.id, role: 'member' },
      { familyId: family.id, accountId: otherMember.id, role: 'member' },
    ]);
    return family.id as string;
  }

  async function createEvent(token: string, title = 'วันเกิดยาย', story = 'เรื่องราววันนั้น') {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: { authorization: `Bearer ${token}` },
      payload: { title, story },
    });
    return response;
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('auth-steward', 'steward@example.com', 'Steward');
    creator = await createTestAccount('auth-creator', 'creator@example.com', 'Creator');
    otherMember = await createTestAccount('auth-other', 'other@example.com', 'Other');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);
    otherToken = await generateTestToken(otherMember.authId, otherMember.email!);
    familyId = await createFamily();
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('AC-27 story required', () => {
    it('rejects create event without story', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { title: 'ไม่มีเรื่อง' },
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe('STORY_REQUIRED');
    });

    it('rejects create event with whitespace-only story', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { title: 'ว่าง', story: '   ' },
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe('STORY_REQUIRED');
    });

    it('rejects add-contribution without story', async () => {
      const created = await createEvent(creatorToken);
      expect(created.statusCode).toBe(201);
      const event = JSON.parse(created.body);

      const response = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/contributions`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe('STORY_REQUIRED');
    });

    it('creates event with story as first contribution', async () => {
      const response = await createEvent(creatorToken);
      expect(response.statusCode).toBe(201);
      const event = JSON.parse(response.body);
      expect(event.archived_at).toBeNull();
      expect(event.deletable_at).toBeNull();
      expect(event.status).toBe('active');

      const rows = await db.select().from(contributions).where(eq(contributions.eventId, event.id));
      expect(rows).toHaveLength(1);
      expect(rows[0].story).toBe('เรื่องราววันนั้น');
      expect(rows[0].ownerAccountId).toBe(creator.id);
    });
  });

  describe('AC-22 archived_at and deletable_at', () => {
    it('sets archived_at on archive, overwrites on re-archive, nulls on restore', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);

      const first = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      expect(first.statusCode).toBe(200);
      const archived = JSON.parse(first.body);
      expect(archived.status).toBe('archived');
      expect(archived.archived_at).toBeTruthy();
      expect(archived.deletable_at).toBeTruthy();
      const firstAt = new Date(archived.archived_at).getTime();
      const deletableAt = new Date(archived.deletable_at).getTime();
      expect(deletableAt - firstAt).toBe(7 * 24 * 60 * 60 * 1000);

      await db.update(events).set({ archivedAt: new Date(Date.now() - 60_000) }).where(eq(events.id, event.id));

      const second = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      const rearchived = JSON.parse(second.body);
      expect(new Date(rearchived.archived_at).getTime()).toBeGreaterThan(firstAt - 30_000);

      const restored = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/unarchive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      const active = JSON.parse(restored.body);
      expect(active.status).toBe('active');
      expect(active.archived_at).toBeNull();
      expect(active.deletable_at).toBeNull();
    });
  });

  describe('AC-19 permanent delete', () => {
    it('returns 403 FORBIDDEN with null schedule when event is not archived', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);

      const response = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { confirm_text: EVENT_DELETE_CONFIRM_TEXT },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.details.archived_at).toBeNull();
      expect(body.error.details.deletable_at).toBeNull();
    });

    it('returns 403 FORBIDDEN with schedule when cooling period has not elapsed', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);
      await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });

      const response = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { confirm_text: EVENT_DELETE_CONFIRM_TEXT },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.details.archived_at).toBeTruthy();
      expect(body.error.details.deletable_at).toBeTruthy();
    });

    it('returns 403 when caller is neither creator nor steward', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);
      await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      await db
        .update(events)
        .set({ archivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(events.id, event.id));

      const response = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { confirm_text: EVENT_DELETE_CONFIRM_TEXT },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error.code).toBe('FORBIDDEN');
    });

    it('returns CONFIRM_TEXT_MISMATCH unless confirm_text is exactly ลบเรื่องนี้ after trim', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);
      await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${creatorToken}` },
      });
      await db
        .update(events)
        .set({ archivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(events.id, event.id));

      const wrong = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { confirm_text: event.title },
      });
      expect(wrong.statusCode).toBe(400);
      expect(JSON.parse(wrong.body).error.code).toBe('CONFIRM_TEXT_MISMATCH');

      const ok = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { confirm_text: `  ${EVENT_DELETE_CONFIRM_TEXT}  ` },
      });
      expect(ok.statusCode).toBe(204);

      const [row] = await db.select().from(events).where(eq(events.id, event.id));
      expect(row.status).toBe('deleted');
      expect(row.title).toBeNull();
    });
  });

  describe('AC-23 AC-26 canManageEvent (creator OR steward)', () => {
    it('allows steward to edit, archive, restore, and delete another member\'s event', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);

      const patched = await server.inject({
        method: 'PATCH',
        url: `/v1/events/${event.id}`,
        headers: { authorization: `Bearer ${stewardToken}` },
        payload: { title: 'หัวข้อใหม่' },
      });
      expect(patched.statusCode).toBe(200);
      expect(JSON.parse(patched.body).title).toBe('หัวข้อใหม่');

      const archived = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${stewardToken}` },
      });
      expect(archived.statusCode).toBe(200);

      const restored = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/unarchive`,
        headers: { authorization: `Bearer ${stewardToken}` },
      });
      expect(restored.statusCode).toBe(200);

      await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${stewardToken}` },
      });
      await db
        .update(events)
        .set({ archivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
        .where(eq(events.id, event.id));

      const deleted = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/delete`,
        headers: { authorization: `Bearer ${stewardToken}` },
        payload: { confirm_text: EVENT_DELETE_CONFIRM_TEXT },
      });
      expect(deleted.statusCode).toBe(204);
    });

    it('forbids a non-creator member from editing or archiving', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);

      const patched = await server.inject({
        method: 'PATCH',
        url: `/v1/events/${event.id}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { title: 'ห้าม' },
      });
      expect(patched.statusCode).toBe(403);

      const archived = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/archive`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(archived.statusCode).toBe(403);
    });
  });

  describe('AC-24 owner-only contributions', () => {
    it('allows owner to edit and forbids steward from editing or deleting others\' stories', async () => {
      const created = await createEvent(creatorToken);
      const event = JSON.parse(created.body);
      const added = await server.inject({
        method: 'POST',
        url: `/v1/events/${event.id}/contributions`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { story: 'เรื่องของฉัน' },
      });
      expect(added.statusCode).toBe(201);
      const contrib = JSON.parse(added.body);

      const ownerEdit = await server.inject({
        method: 'PATCH',
        url: `/v1/contributions/${contrib.id}`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { story: 'แก้ไขแล้ว' },
      });
      expect(ownerEdit.statusCode).toBe(200);
      expect(JSON.parse(ownerEdit.body).story).toBe('แก้ไขแล้ว');

      const stewardEdit = await server.inject({
        method: 'PATCH',
        url: `/v1/contributions/${contrib.id}`,
        headers: { authorization: `Bearer ${stewardToken}` },
        payload: { story: 'สจ๊วตแก้ไม่ได้' },
      });
      expect(stewardEdit.statusCode).toBe(403);
      expect(JSON.parse(stewardEdit.body).error.code).toBe('FORBIDDEN');

      const stewardDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/contributions/${contrib.id}`,
        headers: { authorization: `Bearer ${stewardToken}` },
      });
      expect(stewardDelete.statusCode).toBe(403);
    });
  });

  describe('AC-25 role patch and last-admin', () => {
    it('lets a steward change a member role via /role and still blocks last-admin demotion', async () => {
      const promote = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${familyId}/members/${creator.id}/role`,
        headers: { authorization: `Bearer ${stewardToken}` },
        payload: { role: 'admin' },
      });
      expect(promote.statusCode).toBe(200);

      const [promoted] = await db
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.accountId, creator.id));
      expect(promoted.role).toBe('admin');

      const demoteOtherSteward = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${familyId}/members/${steward.id}/role`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { role: 'member' },
      });
      expect(demoteOtherSteward.statusCode).toBe(200);

      const lastAdmin = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${familyId}/members/${creator.id}/role`,
        headers: { authorization: `Bearer ${creatorToken}` },
        payload: { role: 'member' },
      });
      expect(lastAdmin.statusCode).toBe(409);
      expect(JSON.parse(lastAdmin.body).error.code).toBe('LAST_ADMIN');
    });
  });
});
