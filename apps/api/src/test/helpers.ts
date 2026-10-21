import { buildServer } from '../index.js';
import { db, accounts, families, familyMembers } from '../lib/db/index.js';
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
 * Note: In real tests against Supabase, you'd use actual Supabase tokens
 * For unit tests, we'll mock the JWT verification
 */
export async function generateTestToken(authId: string, email: string): Promise<string> {
  const secret = new TextEncoder().encode('test-secret-key-32-chars-minimum!!');

  const token = await new SignJWT({
    sub: authId,
    email,
    aud: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER)
    .setExpirationTime('1h')
    .sign(secret);

  return token;
}

export async function cleanupTestData() {
  await db.delete(familyMembers);
  await db.delete(families);
  await db.delete(accounts);
}
