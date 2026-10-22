import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, accounts, auditLog } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';

/**
 * Marketing consent tests
 * Tests consent tracking and audit logging
 */
describe('Marketing Consent', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let testAccount: Awaited<ReturnType<typeof createTestAccount>>;
  let testToken: string;

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    testAccount = await createTestAccount('auth-test-1', 'test@example.com', 'Test User');
    testToken = await generateTestToken(testAccount.authId, testAccount.email!);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  describe('PATCH /v1/me/consent', () => {
    it('should update marketing consent to true', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.marketing_consent).toBe(true);
      expect(body.marketing_consent_at).toBeTruthy();
      expect(body.consent_answered_at).toBeTruthy();

      // Verify in database
      const [updated] = await db.select().from(accounts).where(eq(accounts.id, testAccount.id)).limit(1);

      expect(updated.marketingConsent).toBe(true);
      expect(updated.marketingConsentAt).toBeTruthy();
      expect(updated.consentAnsweredAt).toBeTruthy();
    });

    it('records consent_answered_at when a new account declines marketing consent', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.marketing_consent).toBe(false);
      expect(body.consent_answered_at).toBeTruthy();
      expect(body.marketing_consent_at).toBeNull();

      const me = await server.inject({
        method: 'GET',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });
      expect(me.statusCode).toBe(200);
      const meBody = JSON.parse(me.body);
      expect(meBody.consent_answered_at).toBeTruthy();
      expect(meBody.consent_answered_at).toBe(body.consent_answered_at);
      expect(meBody.marketing_consent).toBe(false);
    });

    it('should update marketing consent to false', async () => {
      // First set to true
      await db
        .update(accounts)
        .set({
          marketingConsent: true,
          marketingConsentAt: new Date(),
        })
        .where(eq(accounts.id, testAccount.id));

      // Then set to false
      const response = await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.marketing_consent).toBe(false);
      expect(body.marketing_consent_at).toBeTruthy();
    });

    it('should create audit log entry without content', async () => {
      const response = await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: true,
        },
      });

      expect(response.statusCode).toBe(200);

      // Check audit log
      const logs = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.actorAccountId, testAccount.id))
        .limit(1);

      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('consent_update');
      expect(logs[0].targetType).toBe('account');
      expect(logs[0].targetId).toBe(testAccount.id);
    });

    it('should track multiple consent changes', async () => {
      // Change consent multiple times
      await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: true,
        },
      });

      await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: false,
        },
      });

      await server.inject({
        method: 'PATCH',
        url: '/v1/me/consent',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          marketing_consent: true,
        },
      });

      // Check audit log has all entries
      const logs = await db.select().from(auditLog).where(eq(auditLog.actorAccountId, testAccount.id));

      expect(logs.length).toBeGreaterThanOrEqual(3);
      expect(logs.every((log) => log.action === 'consent_update')).toBe(true);
    });
  });

  describe('GET /v1/me', () => {
    it('should return current consent status', async () => {
      // Set consent
      await db
        .update(accounts)
        .set({
          marketingConsent: true,
          marketingConsentAt: new Date('2026-10-21T12:00:00Z'),
        })
        .where(eq(accounts.id, testAccount.id));

      const response = await server.inject({
        method: 'GET',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.marketing_consent).toBe(true);
      expect(body.marketing_consent_at).toBeTruthy();
      expect(body.consent_answered_at).toBeNull();
      expect(body.email).toBe(testAccount.email);
      expect(body.display_name).toBe(testAccount.displayName);
    });

    it('should show default consent as false for new accounts', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/me',
        headers: {
          authorization: `Bearer ${testToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.marketing_consent).toBe(false);
      expect(body.marketing_consent_at).toBeNull();
      expect(body.consent_answered_at).toBeNull();
    });
  });
});
