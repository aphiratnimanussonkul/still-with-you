import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers } from '../lib/db/index.js';
import { tokenFromInviteUrl } from '../lib/invites.js';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000099';

describe('PATCH/DELETE /v1/people/{id} steward-only', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let creator: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let linked: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let creatorToken: string;
  let memberToken: string;
  let linkedToken: string;
  let outsiderToken: string;
  let familyId: string;
  let personId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('psw-steward', 'psw-steward@example.com', 'Steward');
    creator = await createTestAccount('psw-creator', 'psw-creator@example.com', 'Creator');
    member = await createTestAccount('psw-member', 'psw-member@example.com', 'Member');
    linked = await createTestAccount('psw-linked', 'psw-linked@example.com', 'Linked');
    outsider = await createTestAccount('psw-out', 'psw-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    creatorToken = await generateTestToken(creator.authId, creator.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    linkedToken = await generateTestToken(linked.authId, linked.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านสจวต' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: creator.id, role: 'member' },
      { familyId, accountId: member.id, role: 'member' },
      { familyId, accountId: linked.id, role: 'member' },
    ]);

    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(creatorToken),
      payload: { name: 'ยาย' },
    });
    personId = JSON.parse(created.body).person.id;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  async function patchAs(token: string) {
    return server.inject({
      method: 'PATCH',
      url: `/v1/people/${personId}`,
      headers: await auth(token),
      payload: { bio: 'ห้าม' },
    });
  }

  async function deleteAs(token: string) {
    return server.inject({
      method: 'DELETE',
      url: `/v1/people/${personId}`,
      headers: await auth(token),
    });
  }

  it('returns 403 FORBIDDEN for creator-non-steward, linked self, and regular member on PATCH and DELETE', async () => {
    const invite = await server.inject({
      method: 'POST',
      url: `/v1/people/${personId}/invites`,
      headers: await auth(stewardToken),
      payload: { email: linked.email },
    });
    expect(invite.statusCode).toBe(201);
    const accepted = await server.inject({
      method: 'POST',
      url: `/v1/invites/${tokenFromInviteUrl(JSON.parse(invite.body).url)}/accept`,
      headers: await auth(linkedToken),
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);

    for (const token of [creatorToken, linkedToken, memberToken]) {
      const patched = await patchAs(token);
      expect(patched.statusCode).toBe(403);
      expect(JSON.parse(patched.body).error.code).toBe('FORBIDDEN');

      const deleted = await deleteAs(token);
      expect(deleted.statusCode).toBe(403);
      expect(JSON.parse(deleted.body).error.code).toBe('FORBIDDEN');
    }
  });

  it('lets the steward PATCH 200 and DELETE 204 an unlinked person', async () => {
    const patched = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${personId}`,
      headers: await auth(stewardToken),
      payload: { bio: 'อัปเดตโดยสจวต' },
    });
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).bio).toBe('อัปเดตโดยสจวต');

    const deleted = await deleteAs(stewardToken);
    expect(deleted.statusCode).toBe(204);

    const got = await server.inject({
      method: 'GET',
      url: `/v1/people/${personId}`,
      headers: await auth(stewardToken),
    });
    expect(got.statusCode).toBe(404);
  });

  it('keeps 409 PERSON_LINKED when the steward deletes a linked person', async () => {
    const invite = await server.inject({
      method: 'POST',
      url: `/v1/people/${personId}/invites`,
      headers: await auth(stewardToken),
      payload: { email: linked.email },
    });
    await server.inject({
      method: 'POST',
      url: `/v1/invites/${tokenFromInviteUrl(JSON.parse(invite.body).url)}/accept`,
      headers: await auth(linkedToken),
      payload: {},
    });

    const deleted = await deleteAs(stewardToken);
    expect(deleted.statusCode).toBe(409);
    expect(JSON.parse(deleted.body).error.code).toBe('PERSON_LINKED');
  });

  it('returns 404 for non-members and missing people', async () => {
    const outsiderPatch = await patchAs(outsiderToken);
    expect(outsiderPatch.statusCode).toBe(404);
    expect(JSON.parse(outsiderPatch.body).error.code).toBe('NOT_FOUND');

    const outsiderDelete = await deleteAs(outsiderToken);
    expect(outsiderDelete.statusCode).toBe(404);
    expect(JSON.parse(outsiderDelete.body).error.code).toBe('NOT_FOUND');

    const missingPatch = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${UNKNOWN_UUID}`,
      headers: await auth(stewardToken),
      payload: { bio: 'ไม่มี' },
    });
    expect(missingPatch.statusCode).toBe(404);

    const missingDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/people/${UNKNOWN_UUID}`,
      headers: await auth(stewardToken),
    });
    expect(missingDelete.statusCode).toBe(404);
  });
});
