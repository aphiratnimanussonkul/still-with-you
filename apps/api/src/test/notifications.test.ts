import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, notifications } from '../lib/db/index.js';
import { tokenFromInviteUrl } from '../lib/invites.js';
import { NotificationType } from '../lib/notifications.js';

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

    const older = await db
      .insert(notifications)
      .values({
        accountId: creator.id,
        type: NotificationType.INVITE_ACCEPTED,
        payload: { family_id: familyId },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      })
      .returning();
    const newer = await db
      .insert(notifications)
      .values({
        accountId: creator.id,
        type: NotificationType.CONTRIBUTION_ADDED,
        payload: { family_id: familyId },
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      })
      .returning();
    await db.insert(notifications).values({
      accountId: member.id,
      type: NotificationType.INVITE_ACCEPTED,
      payload: { family_id: familyId },
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
    expect(body.notifications.map((row: { id: string }) => row.id)).toEqual([newer[0].id, older[0].id]);
    expect(body.notifications.every((row: { account_id: string }) => row.account_id === creator.id)).toBe(
      true
    );
  });

  it('paginates with cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await db.insert(notifications).values({
        accountId: creator.id,
        type: NotificationType.CONTRIBUTION_ADDED,
        payload: { n: i },
        createdAt: new Date(`2026-03-0${i + 1}T00:00:00.000Z`),
      });
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
      account_id: creator.id,
      type: 'contribution_added',
      read_at: null,
      payload: {
        family_id: familyId,
        event_id: eventId,
        contribution_id: contributionId,
        actor_account_id: member.id,
      },
    });

    const memberList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(memberToken),
    });
    expect(JSON.parse(memberList.body).notifications).toHaveLength(0);
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
      account_id: steward.id,
      type: 'invite_accepted',
      read_at: null,
      payload: {
        family_id: familyId,
        invite_id: inviteId,
        actor_account_id: invitee.id,
        person_id: null,
      },
    });

    const inviteeList = await server.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: await auth(inviteeToken),
    });
    expect(JSON.parse(inviteeList.body).notifications).toHaveLength(0);
  });

  it('marks a notification read, idempotently, and 404s for another account', async () => {
    const [row] = await db
      .insert(notifications)
      .values({
        accountId: creator.id,
        type: NotificationType.CONTRIBUTION_ADDED,
        payload: { family_id: familyId },
      })
      .returning();

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

    const first = await server.inject({
      method: 'POST',
      url: `/v1/notifications/${row.id}/read`,
      headers: await auth(creatorToken),
    });
    expect(first.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    expect(firstBody.read_at).toBeTruthy();
    expect(firstBody.id).toBe(row.id);

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
});
