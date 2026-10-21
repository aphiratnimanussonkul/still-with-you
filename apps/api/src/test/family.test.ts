import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, cleanupTestData } from './helpers.js';
import { db, familyMember } from '../lib/db/index.js';
import { eq, and, isNull } from 'drizzle-orm';

/**
 * Family management tests
 * Tests role-based permissions, last admin guard, and invite flow
 */
describe('Family Management', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let adminAccount: Awaited<ReturnType<typeof createTestAccount>>;
  let memberAccount: Awaited<ReturnType<typeof createTestAccount>>;

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    adminAccount = await createTestAccount('auth-admin-1', 'admin@example.com', 'Admin User');
    memberAccount = await createTestAccount('auth-member-1', 'member@example.com', 'Member User');
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('POST /v1/families', () => {
    it('should create family and make creator first admin', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
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
        .from(familyMember)
        .where(and(eq(familyMember.familyId, body.id), eq(familyMember.accountId, adminAccount.id)))
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
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Invite member
      const inviteResponse = await server.inject({
        method: 'POST',
        url: `/v1/families/${family.id}/invites`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          email: memberAccount.email,
        },
      });

      expect(inviteResponse.statusCode).toBe(201);

      // Verify member was added
      const [member] = await db
        .select()
        .from(familyMember)
        .where(and(eq(familyMember.familyId, family.id), eq(familyMember.accountId, memberAccount.id)))
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
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add memberAccount as regular member
      await db.insert(familyMember).values({
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
          authorization: `Bearer mock-token-${memberAccount.authId}`,
        },
        payload: {
          email: anotherAccount.email,
        },
      });

      expect(inviteResponse.statusCode).toBe(403);
      const body = JSON.parse(inviteResponse.body);
      expect(body.error.code).toBe('ADMIN_REQUIRED');
    });
  });

  describe('PATCH /v1/families/:fid/members/:aid', () => {
    it('should allow admin to promote member to admin', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMember).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Promote to admin
      const promoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${memberAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          role: 'admin',
        },
      });

      expect(promoteResponse.statusCode).toBe(200);

      // Verify role changed
      const [member] = await db
        .select()
        .from(familyMember)
        .where(and(eq(familyMember.familyId, family.id), eq(familyMember.accountId, memberAccount.id)))
        .limit(1);

      expect(member.role).toBe('admin');
    });

    it('should prevent non-admin from changing roles', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMember).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Try to promote as non-admin
      const promoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${memberAccount.authId}`,
        },
        payload: {
          role: 'member',
        },
      });

      expect(promoteResponse.statusCode).toBe(403);
      const body = JSON.parse(promoteResponse.body);
      expect(body.error.code).toBe('ADMIN_REQUIRED');
    });
  });

  describe('Last Admin Protection', () => {
    it('should prevent demoting the last admin', async () => {
      // Create family (adminAccount becomes first admin)
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Try to demote the only admin
      const demoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          role: 'member',
        },
      });

      // Should fail with database constraint
      expect(demoteResponse.statusCode).toBe(500);
    });

    it('should allow demoting admin when another admin exists', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add second admin
      await db.insert(familyMember).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'admin',
      });

      // Now demote first admin (should work)
      const demoteResponse = await server.inject({
        method: 'PATCH',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          role: 'member',
        },
      });

      expect(demoteResponse.statusCode).toBe(200);

      // Verify role changed
      const [member] = await db
        .select()
        .from(familyMember)
        .where(and(eq(familyMember.familyId, family.id), eq(familyMember.accountId, adminAccount.id)))
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
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add member
      await db.insert(familyMember).values({
        familyId: family.id,
        accountId: memberAccount.id,
        role: 'member',
      });

      // Remove member
      const removeResponse = await server.inject({
        method: 'DELETE',
        url: `/v1/families/${family.id}/members/${memberAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
      });

      expect(removeResponse.statusCode).toBe(204);

      // Verify member has left_at set
      const [member] = await db
        .select()
        .from(familyMember)
        .where(and(eq(familyMember.familyId, family.id), eq(familyMember.accountId, memberAccount.id)))
        .limit(1);

      expect(member.leftAt).not.toBeNull();
    });

    it('should prevent removing last admin', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
        payload: {
          name: 'Test Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Try to remove the only admin
      const removeResponse = await server.inject({
        method: 'DELETE',
        url: `/v1/families/${family.id}/members/${adminAccount.id}`,
        headers: {
          authorization: `Bearer mock-token-${adminAccount.authId}`,
        },
      });

      // Should fail with database constraint
      expect(removeResponse.statusCode).toBe(500);
    });
  });
});
