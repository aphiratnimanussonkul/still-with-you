import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PERSON_SELF_EDITABLE_FIELDS,
  accountAlreadyLinkedErrorSchema,
  personResponseSchema,
} from '@still-with-you/contracts';
import { eq } from 'drizzle-orm';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, people } from '../lib/db/index.js';
import { tokenFromInviteUrl } from '../lib/invites.js';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000099';

describe('PATCH /v1/people/{id} self-edit and POST/DELETE /v1/people/{id}/claim', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardTwo: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let linked: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let stewardTwoToken: string;
  let memberToken: string;
  let linkedToken: string;
  let outsiderToken: string;
  let familyId: string;
  let personId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createPerson(payload: Record<string, unknown> = { name: 'ยาย' }) {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(stewardToken),
      payload,
    });
    expect(created.statusCode).toBe(201);
    return personResponseSchema.parse(JSON.parse(created.body).person);
  }

  async function linkViaInvite(targetPersonId: string) {
    const invite = await server.inject({
      method: 'POST',
      url: `/v1/people/${targetPersonId}/invites`,
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
  }

  async function patchPerson(id: string, token: string, payload: Record<string, unknown>) {
    return server.inject({
      method: 'PATCH',
      url: `/v1/people/${id}`,
      headers: await auth(token),
      payload,
    });
  }

  async function claimPerson(id: string, token: string) {
    return server.inject({
      method: 'POST',
      url: `/v1/people/${id}/claim`,
      headers: await auth(token),
      payload: {},
    });
  }

  async function unclaimPerson(id: string, token: string) {
    return server.inject({
      method: 'DELETE',
      url: `/v1/people/${id}/claim`,
      headers: await auth(token),
    });
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('claim-steward', 'claim-steward@example.com', 'Steward');
    stewardTwo = await createTestAccount('claim-steward-2', 'claim-steward-2@example.com', 'Steward Two');
    member = await createTestAccount('claim-member', 'claim-member@example.com', 'Member');
    linked = await createTestAccount('claim-linked', 'claim-linked@example.com', 'Linked');
    outsider = await createTestAccount('claim-out', 'claim-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    stewardTwoToken = await generateTestToken(stewardTwo.authId, stewardTwo.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    linkedToken = await generateTestToken(linked.authId, linked.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านเคลม' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: stewardTwo.id, role: 'admin' },
      { familyId, accountId: member.id, role: 'member' },
      { familyId, accountId: linked.id, role: 'member' },
    ]);

    personId = (await createPerson({ name: 'ยายสมศรี' })).id;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('PATCH self-edit', () => {
    it('lets the linked account update allowed fields', async () => {
      await linkViaInvite(personId);

      const patched = await patchPerson(personId, linkedToken, {
        display_name: 'ยายใหม่',
        relation_label: 'ยาย',
        bio: 'ชอบทำขนม',
        birth_date: '1942-03-12',
        birth_date_precision: 'day',
        avatar_media_id: null,
      });
      expect(patched.statusCode).toBe(200);
      expect(personResponseSchema.parse(JSON.parse(patched.body))).toMatchObject({
        display_name: 'ยายใหม่',
        name: 'ยายใหม่',
        relation_label: 'ยาย',
        bio: 'ชอบทำขนม',
        birth_date: '1942-03-12',
        birth_date_precision: 'day',
        avatar_media_id: null,
        account_id: linked.id,
      });
      expect(PERSON_SELF_EDITABLE_FIELDS).toEqual([
        'avatar_media_id',
        'display_name',
        'relation_label',
        'bio',
        'birth_date',
        'birth_date_precision',
      ]);
    });

    it('returns 403 FORBIDDEN with field set to the offending field', async () => {
      await linkViaInvite(personId);

      const patched = await patchPerson(personId, linkedToken, {
        bio: 'ได้',
        gender: 'female',
      });
      expect(patched.statusCode).toBe(403);
      expect(JSON.parse(patched.body).error).toMatchObject({
        code: 'FORBIDDEN',
        field: 'gender',
      });

      const named = await patchPerson(personId, linkedToken, { name: 'ห้าม' });
      expect(named.statusCode).toBe(403);
      expect(JSON.parse(named.body).error.field).toBe('name');

      const living = await patchPerson(personId, linkedToken, { is_living: false });
      expect(living.statusCode).toBe(403);
      expect(JSON.parse(living.body).error.field).toBe('is_living');
    });

    it('returns 403 for a non-owner non-admin member', async () => {
      const patched = await patchPerson(personId, memberToken, { bio: 'ห้าม' });
      expect(patched.statusCode).toBe(403);
      expect(JSON.parse(patched.body).error).toEqual(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
      expect(JSON.parse(patched.body).error.field).toBeUndefined();
    });

    it('lets the admin PATCH fields that self-editors cannot', async () => {
      const patched = await patchPerson(personId, stewardToken, {
        gender: 'female',
        family_name: 'นิมานัส',
        is_living: false,
        death_date: '2020-01-01',
      });
      expect(patched.statusCode).toBe(200);
      expect(JSON.parse(patched.body)).toMatchObject({
        gender: 'female',
        family_name: 'นิมานัส',
        is_living: false,
        death_date: '2020-01-01',
      });
    });
  });

  describe('POST /v1/people/{id}/claim', () => {
    it('links the caller account on the happy path and returns the person', async () => {
      const claimed = await claimPerson(personId, stewardToken);
      expect(claimed.statusCode).toBe(200);
      const body = personResponseSchema.parse(JSON.parse(claimed.body));
      expect(body).toMatchObject({
        id: personId,
        account_id: steward.id,
        invite_status: 'linked',
        display_name: 'ยายสมศรี',
      });

      const [row] = await db.select().from(people).where(eq(people.id, personId));
      expect(row.accountId).toBe(steward.id);
    });

    it('returns 409 PERSON_ALREADY_CLAIMED when the person already has account_id', async () => {
      const first = await claimPerson(personId, stewardToken);
      expect(first.statusCode).toBe(200);

      const again = await claimPerson(personId, stewardTwoToken);
      expect(again.statusCode).toBe(409);
      expect(JSON.parse(again.body).error.code).toBe('PERSON_ALREADY_CLAIMED');
    });

    it('returns 409 ACCOUNT_ALREADY_LINKED with the existing person details', async () => {
      const first = await claimPerson(personId, stewardToken);
      expect(first.statusCode).toBe(200);

      const other = await createPerson({ name: 'ตา' });
      const second = await claimPerson(other.id, stewardToken);
      expect(second.statusCode).toBe(409);
      const error = JSON.parse(second.body).error;
      expect(error.code).toBe('ACCOUNT_ALREADY_LINKED');
      expect(accountAlreadyLinkedErrorSchema.parse(JSON.parse(second.body)).error.details).toEqual({
        person_id: personId,
        display_name: 'ยายสมศรี',
      });
    });

    it('lets only one of two concurrent claims succeed; the other gets 409', async () => {
      const other = await createPerson({ name: 'ปู่' });

      const [left, right] = await Promise.all([
        claimPerson(other.id, stewardToken),
        claimPerson(other.id, stewardTwoToken),
      ]);

      const statuses = [left.statusCode, right.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      const winner = left.statusCode === 200 ? left : right;
      const loser = left.statusCode === 409 ? left : right;
      expect(JSON.parse(loser.body).error.code).toBe('PERSON_ALREADY_CLAIMED');
      const winnerAccount = JSON.parse(winner.body).account_id;
      expect([steward.id, stewardTwo.id]).toContain(winnerAccount);

      const [row] = await db.select().from(people).where(eq(people.id, other.id));
      expect(row.accountId).toBe(winnerAccount);
    });

    it('returns 422 PERSON_DELETED for a soft-deleted person', async () => {
      const doomed = await createPerson({ name: 'ลบแล้ว' });
      const deleted = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${doomed.id}`,
        headers: await auth(stewardToken),
      });
      expect(deleted.statusCode).toBe(204);

      const claimed = await claimPerson(doomed.id, stewardToken);
      expect(claimed.statusCode).toBe(422);
      expect(JSON.parse(claimed.body).error.code).toBe('PERSON_DELETED');
    });

    it('returns 422 PERSON_DECEASED when is_living is false', async () => {
      const deceased = await createPerson({ name: 'ปู่', is_living: false });
      const claimed = await claimPerson(deceased.id, stewardToken);
      expect(claimed.statusCode).toBe(422);
      expect(JSON.parse(claimed.body).error.code).toBe('PERSON_DECEASED');
    });

    it('returns 403 FORBIDDEN when a non-admin claims', async () => {
      const claimed = await claimPerson(personId, memberToken);
      expect(claimed.statusCode).toBe(403);
      expect(JSON.parse(claimed.body).error.code).toBe('FORBIDDEN');
    });

    it('returns 404 for outsiders and missing people', async () => {
      const outsiderClaim = await claimPerson(personId, outsiderToken);
      expect(outsiderClaim.statusCode).toBe(404);

      const missing = await claimPerson(UNKNOWN_UUID, stewardToken);
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('DELETE /v1/people/{id}/claim', () => {
    it('lets the linked owner unclaim', async () => {
      await linkViaInvite(personId);
      const unclaimed = await unclaimPerson(personId, linkedToken);
      expect(unclaimed.statusCode).toBe(200);
      expect(personResponseSchema.parse(JSON.parse(unclaimed.body)).account_id).toBeNull();

      const [row] = await db.select().from(people).where(eq(people.id, personId));
      expect(row.accountId).toBeNull();
    });

    it('lets a family admin unclaim', async () => {
      await linkViaInvite(personId);
      const unclaimed = await unclaimPerson(personId, stewardToken);
      expect(unclaimed.statusCode).toBe(200);
      expect(JSON.parse(unclaimed.body).account_id).toBeNull();
    });

    it('returns 403 when another member unclaims', async () => {
      await linkViaInvite(personId);
      const unclaimed = await unclaimPerson(personId, memberToken);
      expect(unclaimed.statusCode).toBe(403);
      expect(JSON.parse(unclaimed.body).error.code).toBe('FORBIDDEN');

      const [row] = await db.select().from(people).where(eq(people.id, personId));
      expect(row.accountId).toBe(linked.id);
    });
  });
});
