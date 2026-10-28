import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, accounts, events, families, familyMembers, notifications, people, sql } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { tokenFromInviteUrl } from '../lib/invites.js';
import { NotificationType } from '../lib/notifications.js';
import {
  contributionAddedPayloadSchema,
  inviteAcceptedPayloadSchema,
  notificationIdParamSchema,
  notificationResponseSchema,
} from '@still-with-you/contracts';

describe('Notifications API', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let memberToken: string;
  let familyId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function seedNotification(
    accountId: string,
    type: string,
    payload: Record<string, unknown>,
    createdAt?: Date
  ) {
    const [row] = await db
      .insert(notifications)
      .values({
        accountId,
        type,
        payload,
        ...(createdAt ? { createdAt } : {}),
      })
      .returning();
    return row;
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('n-steward', 'n-steward@example.com', 'Steward');
    creator = await createTestAccount('n-creator', 'n-creator@example.com', 'Creator');
    member = await createTestAccount('n-member', 'n-member@example.com', 'Member');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);
    memberToken = await generateTestToken(member.authId, member.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'Notification Family' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: creator.id, role: 'member' },
      { familyId, accountId: member.id, role: 'member' },
    ]);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('lists only the caller\'s notifications, newest first, with unread_count', async () => {
    const empty = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(empty.statusCode).toBe(200);
    expect(JSON.parse(empty.body)).toEqual({
      notifications: [],
      next_cursor: null,
      unread_count: 0,
    });

    const older = await seedNotification(
      creator.id,
      NotificationType.INVITE_ACCEPTED,
      {
        actor_display_name: 'Invitee',
        family_name: 'Notification Family',
        family_id: familyId,
        person_id: null,
        person_display_name: null,
      },
      new Date('2026-01-01T00:00:00.000Z')
    );
    const newer = await seedNotification(
      creator.id,
      NotificationType.CONTRIBUTION_ADDED,
      {
        actor_display_name: 'Member',
        event_title: 'วันเกิด',
        event_id: '00000000-0000-4000-a000-000000000001',
        family_id: familyId,
      },
      new Date('2026-02-01T00:00:00.000Z')
    );
    await seedNotification(member.id, NotificationType.INVITE_ACCEPTED, {
      actor_display_name: 'Invitee',
      family_name: 'Notification Family',
      family_id: familyId,
      person_id: null,
      person_display_name: null,
    });

    const list = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body);
    expect(body.unread_count).toBe(2);
    expect(body.next_cursor).toBeNull();
    expect(body.notifications.map((row: { id: string }) => row.id)).toEqual([newer.id, older.id]);
    expect(body.notifications[0]).not.toHaveProperty('account_id');
    expect(body.notifications[0]).toEqual(
      expect.objectContaining({
        id: newer.id,
        type: 'contribution_added',
        read_at: null,
      })
    );
  });

  it('paginates with cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedNotification(
        creator.id,
        NotificationType.CONTRIBUTION_ADDED,
        {
          actor_display_name: 'Member',
          event_title: `เรื่อง ${i}`,
          event_id: '00000000-0000-4000-a000-000000000001',
          family_id: familyId,
        },
        new Date(`2026-03-0${i + 1}T00:00:00.000Z`)
      );
    }

    const first = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications?limit=2',
      headers: await auth(creatorToken),
    });
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.notifications).toHaveLength(2);
    expect(firstBody.next_cursor).toBeTruthy();
    expect(firstBody.unread_count).toBe(3);

    const second = await server.inject({
      method: 'GET',
      url: `/v1/me/notifications?limit=2&cursor=${encodeURIComponent(firstBody.next_cursor)}`,
      headers: await auth(creatorToken),
    });
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.notifications).toHaveLength(1);
    expect(secondBody.next_cursor).toBeNull();
    expect(secondBody.unread_count).toBe(3);
    const ids = [...firstBody.notifications, ...secondBody.notifications].map((row: { id: string }) => row.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('notifies the event creator when someone else adds a contribution, not on self-contribute', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title: 'วันเกิด', story: 'เรื่องแรก' },
    });
    expect(created.statusCode).toBe(201);
    const eventId = JSON.parse(created.body).id;

    const afterCreate = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(JSON.parse(afterCreate.body).notifications).toHaveLength(0);

    const added = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องของฉัน' },
    });
    expect(added.statusCode).toBe(201);
    const contributionId = JSON.parse(added.body).id;

    const creatorList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    const creatorBody = JSON.parse(creatorList.body);
    expect(creatorBody.unread_count).toBe(1);
    expect(creatorBody.notifications).toHaveLength(1);
    expect(creatorBody.notifications[0]).toMatchObject({
      type: 'contribution_added',
      read_at: null,
      payload: {
        actor_display_name: 'Member',
        event_title: 'วันเกิด',
        event_id: eventId,
        family_id: familyId,
      },
    });
    expect(creatorBody.notifications[0]).not.toHaveProperty('account_id');
    expect(contributionAddedPayloadSchema.parse(creatorBody.notifications[0].payload)).toEqual(
      creatorBody.notifications[0].payload
    );
    expect(notificationResponseSchema.parse(creatorBody.notifications[0]).id).toBe(
      creatorBody.notifications[0].id
    );
    expect(creatorBody.notifications[0].payload.contribution_id).toBeUndefined();
    expect(creatorBody.notifications[0].payload.actor_account_id).toBeUndefined();
    expect(contributionId).toBeTruthy();

    const memberList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(memberToken),
    });
    expect(JSON.parse(memberList.body).notifications).toHaveLength(0);
  });

  it('does not insert when the recipient is no longer an active family member', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title: 'วันเกิด', story: 'เรื่องแรก' },
    });
    const eventId = JSON.parse(created.body).id;

    const removed = await server.inject({
      method: 'DELETE',
      url: `/v1/families/${familyId}/members/${creator.id}`,
      headers: await auth(stewardToken),
    });
    expect(removed.statusCode).toBe(204);

    const added = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องของฉัน' },
    });
    expect(added.statusCode).toBe(201);

    const rows = await db.select().from(notifications).where(eq(notifications.accountId, creator.id));
    expect(rows).toHaveLength(0);
  });

  it('lists and counts only notifications from families the caller still belongs to', async () => {
    await seedNotification(creator.id, NotificationType.CONTRIBUTION_ADDED, {
      actor_display_name: 'Member',
      event_title: 'ในบ้าน',
      event_id: '00000000-0000-4000-a000-000000000001',
      family_id: familyId,
    });
    await seedNotification(creator.id, NotificationType.CONTRIBUTION_ADDED, {
      actor_display_name: 'Outsider',
      event_title: 'บ้านอื่น',
      event_id: '00000000-0000-4000-a000-000000000002',
      family_id: '00000000-0000-4000-a000-000000000099',
    });

    const before = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    const beforeBody = JSON.parse(before.body);
    expect(beforeBody.unread_count).toBe(1);
    expect(beforeBody.notifications).toHaveLength(1);
    expect(beforeBody.notifications[0].payload.family_id).toBe(familyId);

    const removed = await server.inject({
      method: 'DELETE',
      url: `/v1/families/${familyId}/members/${creator.id}`,
      headers: await auth(stewardToken),
    });
    expect(removed.statusCode).toBe(204);

    const after = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(after.statusCode).toBe(200);
    expect(JSON.parse(after.body)).toEqual({
      notifications: [],
      next_cursor: null,
      unread_count: 0,
    });
  });

  it('notifies the inviter when an invite is accepted', async () => {
    const invitee = await createTestAccount('n-invitee', 'n-invitee@example.com', 'Invitee');
    const inviteeToken = await generateTestToken(invitee.authId, invitee.email!);
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/invites`,
      headers: await auth(stewardToken),
      payload: { email: invitee.email },
    });
    expect(created.statusCode).toBe(201);
    const token = tokenFromInviteUrl(JSON.parse(created.body).url);
    const inviteId = JSON.parse(created.body).id;

    const accepted = await server.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: await auth(inviteeToken),
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);

    const stewardList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(stewardToken),
    });
    const body = JSON.parse(stewardList.body);
    expect(body.unread_count).toBe(1);
    expect(body.notifications[0]).toMatchObject({
      type: 'invite_accepted',
      read_at: null,
      payload: {
        actor_display_name: 'Invitee',
        family_name: 'Notification Family',
        family_id: familyId,
        person_id: null,
        person_display_name: null,
      },
    });
    expect(inviteAcceptedPayloadSchema.parse(body.notifications[0].payload)).toEqual(
      body.notifications[0].payload
    );
    expect(body.notifications[0].payload.invite_id).toBeUndefined();
    expect(inviteId).toBeTruthy();

    const inviteeList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(inviteeToken),
    });
    expect(JSON.parse(inviteeList.body).notifications).toHaveLength(0);
  });

  it('snapshots names at insert so later renames do not change the payload', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title: 'วันเกิด', story: 'เรื่องแรก' },
    });
    const eventId = JSON.parse(created.body).id;
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องของฉัน' },
    });

    await db.update(accounts).set({ displayName: 'สมาชิกใหม่' }).where(eq(accounts.id, member.id));
    await db.update(events).set({ title: 'วันเกิดยาย' }).where(eq(events.id, eventId));

    const renamed = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(renamed.statusCode).toBe(200);
    expect(JSON.parse(renamed.body).notifications[0].payload).toEqual({
      actor_display_name: 'Member',
      event_title: 'วันเกิด',
      event_id: eventId,
      family_id: familyId,
    });

    const personRes = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(stewardToken),
      payload: { name: 'ยาย' },
    });
    const personId = JSON.parse(personRes.body).person.id;
    const invitee = await createTestAccount('n-linked', 'n-linked@example.com', 'Linked');
    const inviteeToken = await generateTestToken(invitee.authId, invitee.email!);
    const inviteRes = await server.inject({
      method: 'POST',
      url: `/v1/people/${personId}/invites`,
      headers: await auth(stewardToken),
      payload: { email: invitee.email },
    });
    expect(inviteRes.statusCode).toBe(201);
    const token = tokenFromInviteUrl(JSON.parse(inviteRes.body).url);
    const accepted = await server.inject({
      method: 'POST',
      url: `/v1/invites/${token}/accept`,
      headers: await auth(inviteeToken),
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);

    await db.update(families).set({ name: 'บ้านใหม่' }).where(eq(families.id, familyId));
    await db.update(accounts).set({ displayName: 'คนที่ลิงก์' }).where(eq(accounts.id, invitee.id));
    await db.update(people).set({ displayName: 'ยายใหม่' }).where(eq(people.id, personId));

    const livePerson = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(stewardToken),
    });
    expect(livePerson.statusCode).toBe(200);
    expect(JSON.parse(livePerson.body).notifications[0].payload).toEqual({
      actor_display_name: 'Linked',
      family_name: 'Notification Family',
      family_id: familyId,
      person_id: personId,
      person_display_name: 'ยาย',
    });
  });

  it('marks a notification read, idempotently, and 404s for another account or a non-uuid id', async () => {
    const row = await seedNotification(creator.id, NotificationType.CONTRIBUTION_ADDED, {
      actor_display_name: 'Member',
      event_title: 'วันเกิด',
      event_id: '00000000-0000-4000-a000-000000000001',
      family_id: familyId,
    });

    const asOther = await server.inject({
      method: 'POST',
      url: `/v1/notifications/${row.id}/read`,
      headers: await auth(memberToken),
    });
    expect(asOther.statusCode).toBe(404);
    expect(JSON.parse(asOther.body).error.code).toBe('NOT_FOUND');

    const missing = await server.inject({
      method: 'POST',
      url: '/v1/notifications/00000000-0000-4000-a000-000000000099/read',
      headers: await auth(creatorToken),
    });
    expect(missing.statusCode).toBe(404);

    expect(notificationIdParamSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    const invalidId = await server.inject({
      method: 'POST',
      url: '/v1/notifications/not-a-uuid/read',
      headers: await auth(creatorToken),
    });
    expect(invalidId.statusCode).toBe(404);
    expect(JSON.parse(invalidId.body).error.code).toBe('NOT_FOUND');

    const first = await server.inject({
      method: 'POST',
      url: `/v1/notifications/${row.id}/read`,
      headers: await auth(creatorToken),
    });
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.read_at).toBeTruthy();
    expect(firstBody.id).toBe(row.id);
    expect(firstBody).not.toHaveProperty('account_id');
    expect(firstBody).toMatchObject({
      type: 'contribution_added',
      payload: {
        actor_display_name: 'Member',
        event_title: 'วันเกิด',
        event_id: '00000000-0000-4000-a000-000000000001',
        family_id: familyId,
      },
    });

    const second = await server.inject({
      method: 'POST',
      url: `/v1/notifications/${row.id}/read`,
      headers: await auth(creatorToken),
    });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).read_at).toBe(firstBody.read_at);

    const list = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    const listBody = JSON.parse(list.body);
    expect(listBody.unread_count).toBe(0);
    expect(listBody.notifications[0].read_at).toBe(firstBody.read_at);
  });

  it('stores payload as a jsonb object and still reads old string rows', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title: 'วันเกิด', story: 'เรื่องแรก' },
    });
    const eventId = JSON.parse(created.body).id;
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องของฉัน' },
    });

    const stored = await sql<{ t: string }[]>`
      select jsonb_typeof(payload) as t
      from notifications
      where account_id = ${creator.id}
      order by created_at desc
      limit 1
    `;
    expect(stored[0]?.t).toBe('object');

    const stringPayload = JSON.stringify({
      actor_display_name: 'เก่า',
      event_title: 'เรื่องเก่า',
      event_id: eventId,
      family_id: familyId,
    });
    await sql`
      insert into notifications (account_id, type, payload)
      values (${creator.id}::uuid, 'contribution_added', to_jsonb(${stringPayload}::text))
    `;
    const list = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    const items = JSON.parse(list.body).notifications as Array<{ payload: Record<string, unknown> }>;
    expect(items.some((item) => item.payload.actor_display_name === 'เก่า')).toBe(true);
    expect(items.some((item) => item.payload.actor_display_name === 'Member')).toBe(true);
  });

  it('keeps the notification and returns event_title null when the event is archived and the caller is not the creator', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(creatorToken),
      payload: { title: 'วันเกิดยาย', story: 'เรื่องแรก' },
    });
    const eventId = JSON.parse(created.body).id;
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องของฉัน' },
    });
    const archived = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/archive`,
      headers: await auth(creatorToken),
    });
    expect(archived.statusCode).toBe(200);

    const seeded = await seedNotification(steward.id, NotificationType.CONTRIBUTION_ADDED, {
      actor_display_name: 'Member',
      event_title: 'วันเกิดยาย',
      event_id: eventId,
      family_id: familyId,
      extra_event_blurb: 'ไม่ควรเห็น',
    });

    const asCreator = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(creatorToken),
    });
    expect(asCreator.statusCode).toBe(200);
    const creatorPayload = contributionAddedPayloadSchema.parse(
      JSON.parse(asCreator.body).notifications[0].payload
    );
    expect(creatorPayload.event_title).toBe('วันเกิดยาย');

    const asSteward = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(stewardToken),
    });
    expect(asSteward.statusCode).toBe(200);
    const stewardBody = JSON.parse(asSteward.body);
    expect(stewardBody.notifications).toHaveLength(1);
    expect(stewardBody.notifications[0].id).toBe(seeded.id);
    expect(stewardBody.notifications[0].payload).toEqual({
      actor_display_name: 'Member',
      event_title: null,
      event_id: eventId,
      family_id: familyId,
    });
    expect(stewardBody.notifications[0].payload).not.toHaveProperty('extra_event_blurb');
    expect(contributionAddedPayloadSchema.parse(stewardBody.notifications[0].payload).event_title).toBeNull();

    const read = await server.inject({
      method: 'POST',
      url: `/v1/notifications/${seeded.id}/read`,
      headers: await auth(stewardToken),
    });
    expect(read.statusCode).toBe(200);
    expect(notificationResponseSchema.parse(JSON.parse(read.body)).payload).toMatchObject({
      event_title: null,
      event_id: eventId,
    });
  });
});
