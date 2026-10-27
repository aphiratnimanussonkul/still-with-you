import { buildServer } from '../index.js';
import { db, accounts, families, familyMembers, sql } from '../lib/db/index.js';
import { SignJWT } from 'jose';
import { env } from '../lib/env.js';

/**
 * Test helpers
 */

export async function createTestServer() {
  const server = await buildServer();
  return server;
}

export async function createTestAccount(authId: string, email: string, displayName: string) {
  const [acc] = await db
    .insert(accounts)
    .values({
      authId,
      email,
      displayName,
    })
    .returning();

  return acc;
}

export async function createTestFamily(name: string, createdBy: string) {
  const [fam] = await db
    .insert(families)
    .values({
      name,
      createdBy,
    })
    .returning();

  return fam;
}

export async function addFamilyMember(
  familyId: string,
  accountId: string,
  role: 'member' | 'admin' = 'member'
) {
  const [member] = await db
    .insert(familyMembers)
    .values({
      familyId,
      accountId,
      role,
    })
    .returning();

  return member;
}

/**
 * Generate a test JWT token for an account
 * Uses RS256 signing with the test key pair
 */
export async function generateTestToken(authId: string, email: string): Promise<string> {
  const { getTestPrivateKey } = await import('./test-keys.js');
  const privateKey = getTestPrivateKey();

  const token = await new SignJWT({
    sub: authId,
    email,
    aud: 'authenticated',
    user_metadata: {
      full_name: email.split('@')[0],
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
    .setIssuer(env.JWT_ISSUER)
    .setExpirationTime('1h')
    .sign(privateKey);

  return token;
}

export async function cleanupTestData() {
  const { guardTestDatabase } = await import('./database-guards.js');

  // Guard against truncating production databases (TEST_DATABASE_URL only)
  const dbUrl = process.env.TEST_DATABASE_URL;
  if (!dbUrl) {
    throw new Error('TEST_DATABASE_URL is required for tests');
  }
  await guardTestDatabase(dbUrl);

  // Use TRUNCATE to avoid triggering last-admin check
  await sql`TRUNCATE TABLE media_variants, media, focus_people, person_facts, question_skips, person_relationships, family_members, families, accounts, audit_log, invites, outbox CASCADE`;
}
