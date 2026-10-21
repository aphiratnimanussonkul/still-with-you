import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, accounts, families, familyMembers, auditLog } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';

/**
 * Account deletion tests
 * Proves DELETE /v1/me commits successfully without FK violations
 */
describe('Account Deletion', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let testAccount: Awaited<ReturnType<typeof createTestAccount>>;
  let testToken: string;

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    testAccount = await createTestAccount('auth-delete-1', 'delete@example.com', 'Delete User');
    testToken = await generateTestToken(testAccount.authId, testAccount.email!);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('DELETE /v1/me', () => {
    it('should delete account when user is sole member of family', async () => {
      // Create family (user becomes first admin)
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          name: 'Solo Family',
        },
      });

      expect(familyResponse.statusCode).toBe(201);
      const family = JSON.parse(familyResponse.body);

      // Delete account
      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify account deleted
      const [deletedAccount] = await db.select().from(accounts).where(eq(accounts.id, testAccount.id));
      expect(deletedAccount).toBeUndefined();

      // Verify family deleted (sole member)
      const [deletedFamily] = await db.select().from(families).where(eq(families.id, family.id));
      expect(deletedFamily).toBeUndefined();

      // Verify audit log exists with NULL actor
      const logs = await db.select().from(auditLog).where(eq(auditLog.targetId, testAccount.id));
      expect(logs.length).toBeGreaterThan(0);
      const accountDeleteLog = logs.find((l) => l.action === 'account_delete');
      expect(accountDeleteLog).toBeDefined();
    });

    it('should block deletion when user is last admin with other members', async () => {
      // Create family
      const familyResponse = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          name: 'Multi Member Family',
        },
      });

      const family = JSON.parse(familyResponse.body);

      // Add another member
      const otherAccount = await createTestAccount('auth-other-1', 'other@example.com', 'Other User');
      await db.insert(familyMembers).values({
        familyId: family.id,
        accountId: otherAccount.id,
        role: 'member',
      });

      // Try to delete account (should fail - last admin)
      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(409);
      const body = JSON.parse(deleteResponse.body);
      expect(body.error.code).toBe('LAST_ADMIN');

      // Verify account NOT deleted
      const [stillExists] = await db.select().from(accounts).where(eq(accounts.id, testAccount.id));
      expect(stillExists).toBeDefined();
    });

    it('should delete account when no longer in any family', async () => {
      // Just delete account without creating family
      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify account deleted
      const [deletedAccount] = await db.select().from(accounts).where(eq(accounts.id, testAccount.id));
      expect(deletedAccount).toBeUndefined();
    });
  });
});
