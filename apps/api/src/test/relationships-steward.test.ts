import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, personRelationships } from '../lib/db/index.js';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000099';

describe('POST/DELETE relationships steward-only and parent cap', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let other: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let memberToken: string;
  let otherToken: string;
  let outsiderToken: string;
  let familyId: string;

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createPerson(token: string, name: string) {
    const res = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(token),
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body).person as { id: string };
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('rel-steward', 'rel-steward@example.com', 'Steward');
    member = await createTestAccount('rel-member', 'rel-member@example.com', 'Member');
    other = await createTestAccount('rel-other', 'rel-other@example.com', 'Other');
    outsider = await createTestAccount('rel-out', 'rel-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    otherToken = await generateTestToken(other.authId, other.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านความสัมพันธ์' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values([
      { familyId, accountId: member.id, role: 'member' },
      { familyId, accountId: other.id, role: 'member' },
    ]);
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
  });

  it('lets the steward POST 201 and DELETE 204; regular member and edge creator 403; non-member 404', async () => {
    const memberCreatePerson = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
      payload: { name: 'ห้าม' },
    });
    expect(memberCreatePerson.statusCode).toBe(403);
    expect(JSON.parse(memberCreatePerson.body).error.code).toBe('FORBIDDEN');

    const outsiderCreatePerson = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(outsiderToken),
      payload: { name: 'นอก' },
    });
    expect(outsiderCreatePerson.statusCode).toBe(404);
    expect(JSON.parse(outsiderCreatePerson.body).error.code).toBe('NOT_FOUND');

    const parent = await createPerson(stewardToken, 'พ่อ');
    const child = await createPerson(stewardToken, 'ลูก');

    const memberCreate = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(memberToken),
      payload: { person_id: parent.id, related_person_id: child.id, type: 'parent' },
    });
    expect(memberCreate.statusCode).toBe(403);
    expect(JSON.parse(memberCreate.body).error.code).toBe('FORBIDDEN');

    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(stewardToken),
      payload: { person_id: parent.id, related_person_id: child.id, type: 'parent' },
    });
    expect(created.statusCode).toBe(201);
    const edgeId = JSON.parse(created.body).id;

    const memberDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${edgeId}`,
      headers: await auth(memberToken),
    });
    expect(memberDelete.statusCode).toBe(403);
    expect(JSON.parse(memberDelete.body).error.code).toBe('FORBIDDEN');

    const otherDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${edgeId}`,
      headers: await auth(otherToken),
    });
    expect(otherDelete.statusCode).toBe(403);

    const outsiderCreate = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(outsiderToken),
      payload: { person_id: parent.id, related_person_id: child.id, type: 'parent' },
    });
    expect(outsiderCreate.statusCode).toBe(404);
    expect(JSON.parse(outsiderCreate.body).error.code).toBe('NOT_FOUND');

    const outsiderDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${edgeId}`,
      headers: await auth(outsiderToken),
    });
    expect(outsiderDelete.statusCode).toBe(404);
    expect(JSON.parse(outsiderDelete.body).error.code).toBe('NOT_FOUND');

    const missingDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${UNKNOWN_UUID}`,
      headers: await auth(stewardToken),
    });
    expect(missingDelete.statusCode).toBe(404);

    const deleted = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${edgeId}`,
      headers: await auth(stewardToken),
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('returns 403 when the non-steward who created the edge tries to delete it', async () => {
    const parent = await createPerson(stewardToken, 'พ่อ');
    const child = await createPerson(stewardToken, 'ลูก');
    const [edge] = await db
      .insert(personRelationships)
      .values({
        familyId,
        personId: parent.id,
        relatedPersonId: child.id,
        type: 'parent',
        createdByAccountId: member.id,
      })
      .returning();

    const creatorDelete = await server.inject({
      method: 'DELETE',
      url: `/v1/relationships/${edge.id}`,
      headers: await auth(memberToken),
    });
    expect(creatorDelete.statusCode).toBe(403);
    expect(JSON.parse(creatorDelete.body).error.code).toBe('FORBIDDEN');
  });

  it('returns 422 TOO_MANY_PARENTS on a third live parent, including inline create by a steward', async () => {
    const child = await createPerson(stewardToken, 'ลูก');
    const p1 = await createPerson(stewardToken, 'พ่อ1');
    const p2 = await createPerson(stewardToken, 'พ่อ2');
    const p3 = await createPerson(stewardToken, 'พ่อ3');

    const first = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(stewardToken),
      payload: { person_id: p1.id, related_person_id: child.id, type: 'parent' },
    });
    expect(first.statusCode).toBe(201);
    const second = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(stewardToken),
      payload: { person_id: p2.id, related_person_id: child.id, type: 'parent' },
    });
    expect(second.statusCode).toBe(201);

    const third = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(stewardToken),
      payload: { person_id: p3.id, related_person_id: child.id, type: 'parent' },
    });
    expect(third.statusCode).toBe(422);
    expect(JSON.parse(third.body).error.code).toBe('TOO_MANY_PARENTS');

    const inline = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(stewardToken),
      payload: { name: 'พ่อ4', relationship: { kind: 'parent_of', person_id: child.id } },
    });
    expect(inline.statusCode).toBe(422);
    expect(JSON.parse(inline.body).error.code).toBe('TOO_MANY_PARENTS');
    const listedAfterInline = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    expect(
      JSON.parse(listedAfterInline.body).people.some((row: { name: string }) => row.name === 'พ่อ4')
    ).toBe(false);

    const spouse = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/relationships`,
      headers: await auth(stewardToken),
      payload: { person_id: p1.id, related_person_id: p2.id, type: 'spouse' },
    });
    expect(spouse.statusCode).toBe(201);
  });

  it('serializes concurrent parent creates so a child has at most 2 live parents', async () => {
    const child = await createPerson(stewardToken, 'ลูกล็อก');
    const parents = await Promise.all([
      createPerson(stewardToken, 'พ่อล็อก1'),
      createPerson(stewardToken, 'พ่อล็อก2'),
      createPerson(stewardToken, 'พ่อล็อก3'),
      createPerson(stewardToken, 'พ่อล็อก4'),
    ]);

    const stewardHeaders = await auth(stewardToken);
    const results = await Promise.all(
      parents.map((parent) =>
        server.inject({
          method: 'POST',
          url: `/v1/families/${familyId}/relationships`,
          headers: stewardHeaders,
          payload: { person_id: parent.id, related_person_id: child.id, type: 'parent' },
        })
      )
    );

    const created = results.filter((res) => res.statusCode === 201);
    const rejected = results.filter((res) => res.statusCode === 422);
    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((res) => JSON.parse(res.body).error.code === 'TOO_MANY_PARENTS')).toBe(true);

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    const edges = JSON.parse(listed.body).relationships as Array<{
      related_person_id: string;
      type: string;
    }>;
    expect(edges.filter((row) => row.related_person_id === child.id && row.type === 'parent')).toHaveLength(
      2
    );
  });

  it('serializes concurrent inline parent_of creates so a child has at most 2 live parents', async () => {
    const child = await createPerson(stewardToken, 'ลูกอินไลน์');

    const stewardHeaders = await auth(stewardToken);
    const results = await Promise.all(
      ['พ่ออิน1', 'พ่ออิน2', 'พ่ออิน3', 'พ่ออิน4'].map((name) =>
        server.inject({
          method: 'POST',
          url: `/v1/families/${familyId}/people`,
          headers: stewardHeaders,
          payload: { name, relationship: { kind: 'parent_of', person_id: child.id } },
        })
      )
    );

    const created = results.filter((res) => res.statusCode === 201);
    const rejected = results.filter((res) => res.statusCode === 422);
    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((res) => JSON.parse(res.body).error.code === 'TOO_MANY_PARENTS')).toBe(true);

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    const body = JSON.parse(listed.body) as {
      people: Array<{ name: string }>;
      relationships: Array<{ related_person_id: string; type: string }>;
    };
    expect(
      body.relationships.filter((row) => row.related_person_id === child.id && row.type === 'parent')
    ).toHaveLength(2);
    expect(body.people.filter((row) => row.name.startsWith('พ่ออิน'))).toHaveLength(2);
  });

  it('still lists existing over-limit parent edges on GET', async () => {
    const child = await createPerson(stewardToken, 'ลูกเกิน');
    const parents = await Promise.all([
      createPerson(stewardToken, 'พ่อก'),
      createPerson(stewardToken, 'พ่อข'),
      createPerson(stewardToken, 'พ่อค'),
    ]);

    await db.insert(personRelationships).values(
      parents.map((parent) => ({
        familyId,
        personId: parent.id,
        relatedPersonId: child.id,
        type: 'parent' as const,
        createdByAccountId: member.id,
      }))
    );

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    expect(listed.statusCode).toBe(200);
    const edges = JSON.parse(listed.body).relationships as Array<{
      related_person_id: string;
      type: string;
    }>;
    expect(edges.filter((row) => row.related_person_id === child.id && row.type === 'parent')).toHaveLength(
      3
    );
  });
});
