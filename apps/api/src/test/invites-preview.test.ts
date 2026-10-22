import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, invites, people } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { env } from '../lib/env.js';
import { hashInviteToken, tokenFromInviteUrl } from '../lib/invites.js';

describe('Invite preview, URL, and accept (Kret)', () => {
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

  async function createFamilyInvite(email: string) {
    const response = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/invites`,
      headers: await auth(stewardToken),
      payload: { email },
    });
    return response;
  }

  function expectInviteUrl(url: string): string {
    const origin = env.WEB_ORIGIN[0];
    expect(url.startsWith(`${origin}/invites/`)).toBe(true);
    const token = tokenFromInviteUrl(url);
    expect(token).toBeTruthy();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    return token!;
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('invite-steward', 'invite-steward@example.com', 'Steward Name');
    member = await createTestAccount('invite-member', 'invite-member@example.com', 'Member Name');
    outsider = await createTestAccount('invite-out', 'invite-out@example.com', 'Outsider Name');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านนิมานัส' },
    });
    familyId = JSON.parse(familyRes.body).id;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('POST invite create 201 url', () => {
    it('returns url once, stores only a hash, and uses the first WEB_ORIGIN', async () => {
      const created = await createFamilyInvite(member.email!);
      expect(created.statusCode).toBe(201);
      const body = JSON.parse(created.body);
      expect(body.token).toBeUndefined();
      const token = expectInviteUrl(body.url);

      const [row] = await db.select().from(invites).where(eq(invites.id, body.id)).limit(1);
      expect(row.tokenHash).toBe(hashInviteToken(token));
      expect(row.tokenHash).not.toBe(token);
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('includes url on person-invite create', async () => {
      const personRes = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(stewardToken),
        payload: { name: 'ยาย' },
      });
      const personId = JSON.parse(personRes.body).id;
      const created = await server.inject({
        method: 'POST',
        url: `/v1/people/${personId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: member.email },
      });
      expect(created.statusCode).toBe(201);
      const body = JSON.parse(created.body);
      expectInviteUrl(body.url);
      expect(body.person_id).toBe(personId);
      expect(body.token).toBeUndefined();
    });
  });

  describe('GET /v1/invites/:token', () => {
    it('returns public fields without login and never the token or id', async () => {
      const created = await createFamilyInvite(member.email!);
      const token = expectInviteUrl(JSON.parse(created.body).url);

      const preview = await server.inject({
        method: 'GET',
        url: `/v1/invites/${token}`,
      });
      expect(preview.statusCode).toBe(200);
      const body = JSON.parse(preview.body);
      expect(body).toEqual({
        family_name: 'บ้านนิมานัส',
        inviter_display_name: 'Steward Name',
        person_display_name: null,
        expires_at: JSON.parse(created.body).expires_at,
      });
      expect(body.id).toBeUndefined();
      expect(body.token).toBeUndefined();
      expect(body.email).toBeUndefined();
      expect(body.url).toBeUndefined();
    });

    it('returns person_display_name for person invites', async () => {
      const personRes = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(stewardToken),
        payload: { name: 'ตาแดง' },
      });
      const personId = JSON.parse(personRes.body).id;
      const created = await server.inject({
        method: 'POST',
        url: `/v1/people/${personId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: member.email },
      });
      const token = expectInviteUrl(JSON.parse(created.body).url);
      const preview = await server.inject({ method: 'GET', url: `/v1/invites/${token}` });
      expect(preview.statusCode).toBe(200);
      expect(JSON.parse(preview.body).person_display_name).toBe('ตาแดง');
    });

    it('returns 410 INVITE_INVALID for unknown, expired, used, and revoked tokens', async () => {
      const unknown = await server.inject({
        method: 'GET',
        url: `/v1/invites/${'ab'.repeat(32)}`,
      });
      expect(unknown.statusCode).toBe(410);
      expect(JSON.parse(unknown.body).error.code).toBe('INVITE_INVALID');

      const created = await createFamilyInvite(member.email!);
      expect(created.statusCode).toBe(201);
      const inviteId = JSON.parse(created.body).id;
      const token = expectInviteUrl(JSON.parse(created.body).url);

      await db
        .update(invites)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invites.id, inviteId));
      const expired = await server.inject({ method: 'GET', url: `/v1/invites/${token}` });
      expect(expired.statusCode).toBe(410);
      expect(JSON.parse(expired.body).error.code).toBe('INVITE_INVALID');
      await db.update(invites).set({ status: 'expired' }).where(eq(invites.id, inviteId));

      const usedInvite = await createFamilyInvite(outsider.email!);
      expect(usedInvite.statusCode).toBe(201);
      const usedToken = expectInviteUrl(JSON.parse(usedInvite.body).url);
      const accepted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${usedToken}/accept`,
        headers: await auth(outsiderToken),
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      const usedPreview = await server.inject({ method: 'GET', url: `/v1/invites/${usedToken}` });
      expect(usedPreview.statusCode).toBe(410);
      expect(JSON.parse(usedPreview.body).error.code).toBe('INVITE_INVALID');

      const revokee = await createTestAccount('invite-revoke', 'invite-revoke@example.com', 'Revokee');
      const revokeInvite = await createFamilyInvite(revokee.email!);
      expect(revokeInvite.statusCode).toBe(201);
      const revokeId = JSON.parse(revokeInvite.body).id;
      const revokeToken = expectInviteUrl(JSON.parse(revokeInvite.body).url);
      const revoked = await server.inject({
        method: 'DELETE',
        url: `/v1/invites/${revokeId}`,
        headers: await auth(stewardToken),
      });
      expect(revoked.statusCode).toBe(204);
      const revokedPreview = await server.inject({ method: 'GET', url: `/v1/invites/${revokeToken}` });
      expect(revokedPreview.statusCode).toBe(410);
      expect(JSON.parse(revokedPreview.body).error.code).toBe('INVITE_INVALID');
    });

    it('rate-limits preview per IP', async () => {
      const max = env.INVITE_PREVIEW_RATE_LIMIT_MAX;
      let limited: Awaited<ReturnType<typeof server.inject>> | undefined;
      for (let i = 0; i < max + 1; i += 1) {
        const res = await server.inject({
          method: 'GET',
          url: `/v1/invites/${'cd'.repeat(32)}`,
          remoteAddress: '203.0.113.10',
        });
        if (res.statusCode === 429) {
          limited = res;
          break;
        }
      }
      expect(limited?.statusCode).toBe(429);
      expect(JSON.parse(limited!.body).error.code).toBe('RATE_LIMITED');
    });
  });

  describe('POST /v1/invites/:token/accept', () => {
    it('requires login, accepts body {}, is single-use, and returns family_id and person_id', async () => {
      const created = await createFamilyInvite(member.email!);
      const token = expectInviteUrl(JSON.parse(created.body).url);

      const noAuth = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        payload: {},
      });
      expect(noAuth.statusCode).toBe(401);
      expect(JSON.parse(noAuth.body).error.code).toBe('UNAUTHENTICATED');

      const extraBody = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(memberToken),
        payload: { email: member.email },
      });
      expect(extraBody.statusCode).toBe(400);

      const accepted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(memberToken),
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      expect(JSON.parse(accepted.body)).toEqual({ family_id: familyId, person_id: null });

      const [membership] = await db
        .select()
        .from(familyMembers)
        .where(eq(familyMembers.accountId, member.id));
      expect(membership.familyId).toBe(familyId);

      const reused = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(memberToken),
        payload: {},
      });
      expect(reused.statusCode).toBe(410);
      expect(JSON.parse(reused.body).error.code).toBe('INVITE_INVALID');
    });

    it('returns person_id on person-invite accept and PERSON_ALREADY_LINKED when taken', async () => {
      const personRes = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(stewardToken),
        payload: { name: 'ปู่' },
      });
      const personId = JSON.parse(personRes.body).id;
      const created = await server.inject({
        method: 'POST',
        url: `/v1/people/${personId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: member.email },
      });
      const token = expectInviteUrl(JSON.parse(created.body).url);

      const mismatch = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(outsiderToken),
        payload: {},
      });
      expect(mismatch.statusCode).toBe(410);
      expect(JSON.parse(mismatch.body).error.code).toBe('INVITE_INVALID');

      const accepted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(memberToken),
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      expect(JSON.parse(accepted.body)).toEqual({ family_id: familyId, person_id: personId });

      const [row] = await db.select().from(people).where(eq(people.id, personId));
      expect(row.accountId).toBe(member.id);

      const again = await server.inject({
        method: 'POST',
        url: `/v1/people/${personId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: outsider.email },
      });
      expect(again.statusCode).toBe(409);
      expect(JSON.parse(again.body).error.code).toBe('PERSON_ALREADY_LINKED');
    });

    it('returns 410 INVITE_INVALID for expired and unknown tokens', async () => {
      const created = await createFamilyInvite(member.email!);
      const inviteId = JSON.parse(created.body).id;
      const token = expectInviteUrl(JSON.parse(created.body).url);
      await db.update(invites).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invites.id, inviteId));

      const expired = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(memberToken),
        payload: {},
      });
      expect(expired.statusCode).toBe(410);
      expect(JSON.parse(expired.body).error.code).toBe('INVITE_INVALID');

      const unknown = await server.inject({
        method: 'POST',
        url: `/v1/invites/${'ef'.repeat(32)}/accept`,
        headers: await auth(memberToken),
        payload: {},
      });
      expect(unknown.statusCode).toBe(410);
      expect(JSON.parse(unknown.body).error.code).toBe('INVITE_INVALID');
    });
  });
});
