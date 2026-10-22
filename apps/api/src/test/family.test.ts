import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers } from '../lib/db/index.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../lib/env.js';
import { tokenFromInviteUrl } from '../lib/invites.js';

/**
 * Family management tests
 * Tests role-based permissions, last admin guard, and invite flow
 */
describe('Family Management', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let adminAccount: Awaited<ReturnType<typeof createTestAccount>>;
  let memberAccount: Awaited<ReturnType<typeof createTestAccount>>;
  let adminToken: string;
  let memberToken: string;

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    adminAccount = await createTestAccount('auth-admin-1', 'admin@example.com', 'Admin User');
    memberAccount = await createTestAccount('auth-member-1', 'member@example.com', 'Member User');
    adminToken = await generateTestToken(adminAccount.authId, adminAccount.email!);
    memberToken = await generateTestToken(memberAccount.authId, memberAccount.email!);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('GET /v1/families', () => {
    it('should list families the caller belongs to', async () => {
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      const listResponse = await server.inject({
        method: 'GET',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(listResponse.statusCode).toBe(200);
      const body = JSON.parse(listResponse.body);
      expect(body.families).toHaveLength(1);
      expect(body.families[0].id).toBe(family.id);
      expect(body.families[0].name).toBe('Test Family');

      const outsiderList = await server.inject({
        method: 'GET',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${memberToken}`,
        },
      });

      expect(outsiderList.statusCode).toBe(200);
      expect(JSON.parse(outsiderList.body).families).toHaveLength(0);
    });
  });

  describe('POST /v1/families', () => {
    it('should create family and make creator first admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Test Family');
      expect(body.created_by).toBe(adminAccount.id);

      // Verify creator is admin
      const [member] = await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, body.id), eq(familyMembers.accountId, adminAccount.id)))
        .limit(1);

      expect(member).toBeDefined();
      expect(member.role).toBe('admin');
    });
  });

  describe('POST /v1/families/:fid/invites', () => {
    it('should allow admin to invite member', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Create invite
      const inviteResponse = await server.inject({
        method: 'POST',
        url: `/v1/families/${family.id}/invites`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          email: memberAccount.email,
        },
      });

      expect(inviteResponse.statusCode).toBe(201);
      const inviteBody = JSON.parse(inviteResponse.body);
      expect(inviteBody.url).toBe(`${env.WEB_ORIGIN[0]}/invites/${tokenFromInviteUrl(inviteBody.url)}`);
      const token = tokenFromInviteUrl(inviteBody.url);
      expect(token).toBeTruthy();

      // Accept invite
      const acceptResponse = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: {
          authorization: `Bearer ${memberToken}`,
        },
        payload: {},
      });

      expect(acceptResponse.statusCode).toBe(200);
      expect(JSON.parse(acceptResponse.body)).toEqual({ family_id: family.id, person_id: null });

      // Verify member was added
      const [member] = await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.accountId, memberAccount.id)))
        .limit(1);

      expect(member).toBeDefined();
      expect(member.role).toBe('member');
    });

    it('should prevent non-admin from inviting', async () => {
      // Create family as admin
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add memberAccount as regular member
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Try to invite as non-admin
      const anotherAccount = await createTestAccount('auth-another-1', 'another@example.com', 'Another User');

      const inviteResponse = await server.inject({
        method: 'POST',
        url: `/v1/families/${family.id}/invites`,
        headers: {
          authorization: `Bearer ${memberToken}`,
        },
        payload: {
          email: anotherAccount.email,
        },
      });

      expect(inviteResponse.statusCode).toBe(403);
      const body = JSON.parse(inviteResponse.body);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('PATCH /v1/families/:fid/members/:aid', () => {
    it('should allow admin to promote member to admin', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Promote to admin
      const promoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${memberAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: 'admin',
        },
      });

      expect(promoteResponse.statusCode).toBe(200);
      const promotedBody = JSON.parse(promoteResponse.body);
      expect(promotedBody).toMatchObject({
        account_id: memberAccount.id,
        family_id: family.id,
        role: 'admin',
        display_name: memberAccount.displayName,
      });
      expect(promotedBody.joined_at).toBeTruthy();

      // Verify role changed
      const [member] = await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.accountId, memberAccount.id)))
        .limit(1);

      expect(member.role).toBe('admin');
    });

    it('should prevent non-admin from changing roles', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Try to promote as non-admin
      const promoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer ${memberToken}`,
        },
        payload: {
          role: 'member',
        },
      });

      expect(promoteResponse.statusCode).toBe(403);
      const body = JSON.parse(promoteResponse.body);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Last Admin Protection', () => {
    it('should prevent demoting the last admin', async () => {
      // Create family (adminAccount becomes first admin)
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add another member (non-admin)
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Try to demote the only admin (with other members present)
      const demoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: 'member',
        },
      });

      // Should fail with 409 LAST_ADMIN error
      expect(demoteResponse.statusCode).toBe(409);
      const body = JSON.parse(demoteResponse.body);
      expect(body.error.code).toBe('LAST_ADMIN');
    });

    it('should block demoting sole admin even without other members', async () => {
      // Create family (adminAccount becomes first and only admin)
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Solo Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Try to demote the sole admin
      const demoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: 'member',
        },
      });

      // Should fail with 409 LAST_ADMIN error (even though sole member)
      expect(demoteResponse.statusCode).toBe(409);
      const body = JSON.parse(demoteResponse.body);
      expect(body.error.code).toBe('LAST_ADMIN');
    });

    it('should allow demoting admin when another admin exists', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add second admin
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'admin',
      });

      // Now demote first admin (should work)
      const demoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: 'member',
        },
      });

      expect(demoteResponse.statusCode).toBe(200);

      // Verify role changed
      const [member] = await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.accountId, adminAccount.id)))
        .limit(1);

      expect(member.role).toBe('member');
    });
  });

  describe('DELETE /v1/families/:fid/members/:aid', () => {
    it('should allow admin to remove member', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Remove member
      const removeResponse = await server.inject({
        method: 'DELETE',
        url: `/v1/families/${family.id}/members/${memberAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(removeResponse.statusCode).toBe(204);

      // Verify member has left_at set
      const [member] = await db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.accountId, memberAccount.id)))
        .limit(1);

      expect(member.leftAt).not.toBeNull();
    });

    it('should prevent removing last admin', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add another member (non-admin)
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Try to remove the only admin (with other members present)
      const removeResponse = await server.inject({
        method: 'DELETE',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      // Should fail with 409 LAST_ADMIN error
      expect(removeResponse.statusCode).toBe(409);
      const body = JSON.parse(removeResponse.body);
      expect(body.error.code).toBe('LAST_ADMIN');
    });
  });
});
