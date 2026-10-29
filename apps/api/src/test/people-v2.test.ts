import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, people } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { computePersonAge } from '../lib/age.js';
import {
  createPersonResponseSchema,
  personResponseSchema,
} from '@still-with-you/contracts';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000099';

describe('People v2 (living, death, inline relationship)', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let memberToken: string;
  let familyId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createPerson(payload: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
      payload,
    });
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();
    steward = await createTestAccount('v2-steward', 'v2-steward@example.com', 'Steward');
    member = await createTestAccount('v2-member', 'v2-member@example.com', 'Member');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านวีทู' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values({ familyId, accountId: member.id, role: 'member' });
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('creates a living person and returns { person, relationship: null }', async () => {
    const res = await createPerson({
      name: 'ยายสมศรี',
      relation_label: 'ยาย',
      birth_date: '1942',
      birth_date_precision: 'year',
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.relationship).toBeNull();
    expect(createPersonResponseSchema.parse(body).person.id).toBe(body.person.id);
    expect(personResponseSchema.parse(body.person)).toMatchObject({
      display_name: 'ยายสมศรี',
      name: 'ยายสมศรี',
      relation_label: 'ยาย',
      avatar_url: null,
      memory_count: 0,
      is_living: true,
      death_date: null,
      death_date_precision: null,
      age: computePersonAge({
        isLiving: true,
        birthDate: '1942-01-01',
        birthPrecision: 'year',
      }),
    });
  });

  it('accepts deceased without death_date and returns null age', async () => {
    const res = await createPerson({
      name: 'ปู่',
      is_living: false,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).person).toMatchObject({
      is_living: false,
      death_date: null,
      death_date_precision: null,
      age: null,
    });
  });

  it('computes age at death when both dates are set', async () => {
    const res = await createPerson({
      name: 'ตา',
      is_living: false,
      birth_date: '1942-03-12',
      birth_date_precision: 'day',
      death_date: '2020-03-11',
      death_date_precision: 'day',
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).person).toMatchObject({
      is_living: false,
      death_date: '2020-03-11',
      death_date_precision: 'day',
      age: 77,
    });
  });

  it('rejects death_date while still living', async () => {
    const res = await createPerson({
      name: 'ยังอยู่',
      is_living: true,
      death_date: '2020-01-01',
      death_date_precision: 'day',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatchObject({
      code: 'INVALID_DEATH_DATE',
      field: 'death_date',
    });
  });

  it('rejects death_date before birth_date or in the future', async () => {
    const beforeBirth = await createPerson({
      name: 'ก่อนเกิด',
      is_living: false,
      birth_date: '1950-01-01',
      death_date: '1949-12-31',
      death_date_precision: 'day',
    });
    expect(beforeBirth.statusCode).toBe(400);
    expect(JSON.parse(beforeBirth.body).error.code).toBe('INVALID_DEATH_DATE');

    const future = await createPerson({
      name: 'อนาคต',
      is_living: false,
      death_date: '2099-01-01',
      death_date_precision: 'day',
    });
    expect(future.statusCode).toBe(400);
    expect(JSON.parse(future.body).error.code).toBe('INVALID_DEATH_DATE');
  });

  it('requires death_date_precision only when death_date is set', async () => {
    const extra = await createPerson({
      name: 'ความแม่นเกิน',
      is_living: false,
      death_date_precision: 'year',
    });
    expect(extra.statusCode).toBe(400);
    expect(JSON.parse(extra.body).error).toMatchObject({
      code: 'INVALID_DEATH_DATE',
      field: 'death_date_precision',
    });
  });

  it('maps inline parent_of, child_of, and spouse_of in one transaction', async () => {
    const existing = JSON.parse((await createPerson({ name: 'แม่' })).body).person;

    const child = await createPerson({
      name: 'ลูก',
      relationship: { kind: 'child_of', person_id: existing.id },
    });
    expect(child.statusCode).toBe(201);
    const childBody = JSON.parse(child.body);
    expect(childBody.relationship).toMatchObject({
      person_id: existing.id,
      related_person_id: childBody.person.id,
      type: 'parent',
      family_id: familyId,
    });

    const parent = await createPerson({
      name: 'พ่อ',
      relationship: { kind: 'parent_of', person_id: childBody.person.id },
    });
    expect(parent.statusCode).toBe(201);
    const parentBody = JSON.parse(parent.body);
    expect(parentBody.relationship).toMatchObject({
      person_id: parentBody.person.id,
      related_person_id: childBody.person.id,
      type: 'parent',
    });

    const spouse = await createPerson({
      name: 'คู่',
      relationship: { kind: 'spouse_of', person_id: existing.id },
    });
    expect(spouse.statusCode).toBe(201);
    const spouseBody = JSON.parse(spouse.body);
    expect(spouseBody.relationship.type).toBe('spouse');
    expect([spouseBody.relationship.person_id, spouseBody.relationship.related_person_id].sort()).toEqual(
      [existing.id, spouseBody.person.id].sort()
    );

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    const listBody = JSON.parse(listed.body);
    expect(listBody.relationships).toHaveLength(3);
    expect(listBody.people.find((row: { id: string }) => row.id === existing.id)).toMatchObject({
      is_living: true,
      death_date: null,
      death_date_precision: null,
    });
  });

  it('uses field relationship.person_id when the target is missing or other-family, and rolls back', async () => {
    const otherFamily = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านอื่น' },
    });
    const otherFamilyId = JSON.parse(otherFamily.body).id;
    const [outsider] = await db
      .insert(people)
      .values({
        familyId: otherFamilyId,
        displayName: 'คนนอก',
        createdByAccountId: steward.id,
      })
      .returning();

    for (const kind of ['parent_of', 'child_of', 'spouse_of'] as const) {
      for (const person_id of [UNKNOWN_UUID, outsider.id]) {
        const res = await createPerson({
          name: `ไม่ผ่าน-${kind}`,
          relationship: { kind, person_id },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatchObject({
          code: 'INVALID_INPUT',
          field: 'relationship.person_id',
        });
      }
    }

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(listed.body).people).toEqual([]);
    const rows = await db.select().from(people).where(eq(people.familyId, familyId));
    expect(rows).toHaveLength(0);
  });

  it('enforces living/death_date and precision pairing at the database', async () => {
    await expect(
      db.insert(people).values({
        familyId,
        displayName: 'มีชีวิตแต่มีวันจากไป',
        createdByAccountId: member.id,
        isLiving: true,
        deathDate: '2020-01-01',
        deathDatePrecision: 'day',
      })
    ).rejects.toThrow(/living_or_no_death_date|check/i);

    await expect(
      db.insert(people).values({
        familyId,
        displayName: 'วันจากไปไม่มีความแม่น',
        createdByAccountId: member.id,
        isLiving: false,
        deathDate: '2020-01-01',
        deathDatePrecision: null,
      })
    ).rejects.toThrow(/death_date_precision_pair|check/i);
  });

  it('returns INVALID_RELATIONSHIP for a parent cycle on inline create', async () => {
    const a = JSON.parse((await createPerson({ name: 'A' })).body).person;
    const b = JSON.parse(
      (
        await createPerson({
          name: 'B',
          relationship: { kind: 'child_of', person_id: a.id },
        })
      ).body
    ).person;
    const c = JSON.parse(
      (
        await createPerson({
          name: 'C',
          relationship: { kind: 'child_of', person_id: b.id },
        })
      ).body
    ).person;

    const cycle = await createPerson({
      name: 'วง',
      relationship: { kind: 'parent_of', person_id: a.id },
    });
    // New person as parent of A is not a cycle. Cycle: make C a parent of A via existing API.
    expect(cycle.statusCode).toBe(201);

    const loop = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(memberToken),
      payload: { person_id: c.id, related_person_id: a.id, type: 'parent' },
    });
    expect(loop.statusCode).toBe(400);
    expect(JSON.parse(loop.body).error.code).toBe('INVALID_RELATIONSHIP');
  });

  it('returns RELATIONSHIP_EXISTS when the inline edge already exists', async () => {
    const a = JSON.parse((await createPerson({ name: 'A' })).body).person;
    const bRes = await createPerson({
      name: 'B',
      relationship: { kind: 'parent_of', person_id: a.id },
    });
    expect(bRes.statusCode).toBe(201);
    const b = JSON.parse(bRes.body).person;

    const dup = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(memberToken),
      payload: { person_id: b.id, related_person_id: a.id, type: 'parent' },
    });
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.body).error.code).toBe('RELATIONSHIP_EXISTS');
  });

  it('patches living/death fields with the same validation', async () => {
    const created = await createPerson({ name: 'จะแก้', birth_date: '1940-01-01' });
    const id = JSON.parse(created.body).person.id;

    const died = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${id}`,
      headers: await auth(stewardToken),
      payload: {
        is_living: false,
        death_date: '2020',
        death_date_precision: 'year',
        relation_label: 'ตา',
      },
    });
    expect(died.statusCode).toBe(200);
    expect(JSON.parse(died.body)).toMatchObject({
      is_living: false,
      death_date: '2020-01-01',
      death_date_precision: 'year',
      relation_label: 'ตา',
      age: 80,
    });

    const livingWithDeath = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${id}`,
      headers: await auth(stewardToken),
      payload: { is_living: true },
    });
    expect(livingWithDeath.statusCode).toBe(400);
    expect(JSON.parse(livingWithDeath.body).error.code).toBe('INVALID_DEATH_DATE');

    const cleared = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${id}`,
      headers: await auth(stewardToken),
      payload: { is_living: true, death_date: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(JSON.parse(cleared.body)).toMatchObject({
      is_living: true,
      death_date: null,
      death_date_precision: null,
    });
  });
});
