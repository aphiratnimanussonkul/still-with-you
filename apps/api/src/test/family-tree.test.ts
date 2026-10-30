import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, media, people, personFacts, contributions, questionBank } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { computeAge } from '../lib/age.js';
import { tokenFromInviteUrl } from '../lib/invites.js';

const UNKNOWN_UUID = '00000000-0000-4000-a000-000000000099';

describe('Family tree (contract v0.8)', () => {
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

  async function createPerson(token: string, payload: Record<string, unknown>) {
    return server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(token),
      payload,
    });
  }

  function createdPerson(res: { body: string }) {
    return JSON.parse(res.body).person;
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('auth-tree-steward', 'tree-steward@example.com', 'Steward');
    member = await createTestAccount('auth-tree-member', 'tree-member@example.com', 'Member');
    other = await createTestAccount('auth-tree-other', 'tree-other@example.com', 'Other');
    outsider = await createTestAccount('auth-tree-out', 'tree-out@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    otherToken = await generateTestToken(other.authId, other.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านเรา' },
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

  describe('person validation', () => {
    it('returns 400 NAME_REQUIRED with field name when name is blank', async () => {
      const res = await createPerson(memberToken, { name: '  ' });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatchObject({ code: 'NAME_REQUIRED', field: 'name' });
    });

    it('returns 400 NAME_REQUIRED with field display_name when display_name is blank', async () => {
      const res = await createPerson(memberToken, { display_name: '' });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatchObject({ code: 'NAME_REQUIRED', field: 'display_name' });
    });

    it('returns 400 INVALID_BIRTH_DATE for a future birth_date', async () => {
      const res = await createPerson(memberToken, { name: 'เด็ก', birth_date: '2099-01-01' });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatchObject({
        code: 'INVALID_BIRTH_DATE',
        field: 'birth_date',
      });
    });

    it('accepts gender female|male|other|null and rejects other values', async () => {
      for (const gender of ['female', 'male', 'other', null]) {
        const res = await createPerson(memberToken, { name: `คน-${gender}`, gender });
        expect(res.statusCode).toBe(201);
        expect(createdPerson(res).gender).toBe(gender);
      }
      const bad = await createPerson(memberToken, { name: 'ไม่ใช่', gender: 'unknown' });
      expect(bad.statusCode).toBe(400);
      expect(JSON.parse(bad.body).error).toMatchObject({ code: 'INVALID_INPUT', field: 'gender' });
    });
  });

  describe('GET people', () => {
    it('returns people and relationships with computed age and invite_status', async () => {
      const created = await createPerson(memberToken, {
        display_name: 'ยายสมศรี',
        birth_date: '1942',
        birth_date_precision: 'year',
        gender: 'female',
      });
      expect(created.statusCode).toBe(201);
      const person = createdPerson(created);
      expect(person.age).toBe(computeAge('1942-01-01', 'year'));
      expect(person.is_living).toBe(true);
      expect(person.death_date).toBeNull();
      expect(person.death_date_precision).toBeNull();
      expect(person.invite_status).toBe('none');
      expect(person.birth_date_precision).toBe('year');

      const listed = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(memberToken),
      });
      expect(listed.statusCode).toBe(200);
      const body = JSON.parse(listed.body);
      expect(body.people).toHaveLength(1);
      expect(body.relationships).toEqual([]);
      expect(body.people[0]).toMatchObject({
        id: person.id,
        display_name: 'ยายสมศรี',
        name: 'ยายสมศรี',
        age: computeAge('1942-01-01', 'year'),
        invite_status: 'none',
      });
    });
  });

  describe('permission matrix', () => {
    it('lets any member create; only the family steward may PATCH or DELETE', async () => {
      const created = await createPerson(memberToken, { name: 'ปู่' });
      expect(created.statusCode).toBe(201);
      const id = createdPerson(created).id;

      const creatorPatch = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${id}`,
        headers: await auth(memberToken),
        payload: { bio: 'ผู้สร้าง' },
      });
      expect(creatorPatch.statusCode).toBe(403);
      expect(JSON.parse(creatorPatch.body).error.code).toBe('FORBIDDEN');

      const stewardPatch = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${id}`,
        headers: await auth(stewardToken),
        payload: { family_name: 'นิมานัส' },
      });
      expect(stewardPatch.statusCode).toBe(200);

      const otherPatch = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${id}`,
        headers: await auth(otherToken),
        payload: { bio: 'ห้าม' },
      });
      expect(otherPatch.statusCode).toBe(403);
      expect(JSON.parse(otherPatch.body).error.code).toBe('FORBIDDEN');

      const invite = await server.inject({
        method: 'POST',
        url: `/v1/people/${id}/invites`,
        headers: await auth(stewardToken),
        payload: { email: other.email },
      });
      expect(invite.statusCode).toBe(201);
      const token = tokenFromInviteUrl(JSON.parse(invite.body).url);
      const accepted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${token}/accept`,
        headers: await auth(otherToken),
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      expect(JSON.parse(accepted.body)).toEqual({ family_id: familyId, person_id: id });

      const linkedPatch = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${id}`,
        headers: await auth(otherToken),
        payload: { bio: 'โปรไฟล์ตัวเอง' },
      });
      expect(linkedPatch.statusCode).toBe(403);
      expect(JSON.parse(linkedPatch.body).error.code).toBe('FORBIDDEN');
    });

    it('lets only the steward soft-delete; creator, linked self, and other member 403', async () => {
      const created = await createPerson(memberToken, { name: 'ลบได้' });
      const id = createdPerson(created).id;

      const otherDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${id}`,
        headers: await auth(otherToken),
      });
      expect(otherDelete.statusCode).toBe(403);

      const creatorDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${id}`,
        headers: await auth(memberToken),
      });
      expect(creatorDelete.statusCode).toBe(403);
      expect(JSON.parse(creatorDelete.body).error.code).toBe('FORBIDDEN');

      const deleted = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${id}`,
        headers: await auth(stewardToken),
      });
      expect(deleted.statusCode).toBe(204);

      const get = await server.inject({
        method: 'GET',
        url: `/v1/people/${id}`,
        headers: await auth(memberToken),
      });
      expect(get.statusCode).toBe(404);
    });
  });

  describe('soft delete', () => {
    it('keeps stories, removes person_facts, and returns 409 PERSON_LINKED when account_id is set', async () => {
      const created = await createPerson(memberToken, { name: 'ยาย' });
      const id = createdPerson(created).id;

      const event = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/events`,
        headers: await auth(memberToken),
        payload: { title: 'วันเกิด', story: 'เล่าเรื่องยาย', person_ids: [id] },
      });
      expect(event.statusCode).toBe(201);

      const questions = await server.inject({
        method: 'GET',
        url: `/v1/people/${id}/facts`,
        headers: await auth(memberToken),
      });
      expect(questions.statusCode).toBe(200);

      const [question] = await db.select().from(questionBank).limit(1);
      const fact = await server.inject({
        method: 'POST',
        url: `/v1/people/${id}/facts`,
        headers: await auth(memberToken),
        payload: { question_id: question.id, answer_text: 'ขนมครก' },
      });
      expect(fact.statusCode).toBe(201);

      const del = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${id}`,
        headers: await auth(stewardToken),
      });
      expect(del.statusCode).toBe(204);

      const facts = await db.select().from(personFacts).where(eq(personFacts.personId, id));
      expect(facts).toHaveLength(0);

      const stories = await db.select().from(contributions).where(eq(contributions.familyId, familyId));
      expect(stories.length).toBeGreaterThan(0);
      expect(stories[0].story).toBe('เล่าเรื่องยาย');

      const linked = await createPerson(memberToken, { name: 'คนลิงก์' });
      const linkedId = createdPerson(linked).id;
      const invite = await server.inject({
        method: 'POST',
        url: `/v1/people/${linkedId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: other.email },
      });
      await server.inject({
        method: 'POST',
        url: `/v1/invites/${tokenFromInviteUrl(JSON.parse(invite.body).url)}/accept`,
        headers: await auth(otherToken),
        payload: {},
      });
      const linkedDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/people/${linkedId}`,
        headers: await auth(stewardToken),
      });
      expect(linkedDelete.statusCode).toBe(409);
      expect(JSON.parse(linkedDelete.body).error.code).toBe('PERSON_LINKED');
    });
  });

  describe('relationships', () => {
    it('stores parent and spouse; self-link and cycles are 400 INVALID_RELATIONSHIP; duplicates 409', async () => {
      const a = createdPerson(await createPerson(memberToken, { name: 'A' }));
      const b = createdPerson(await createPerson(memberToken, { name: 'B' }));
      const c = createdPerson(await createPerson(memberToken, { name: 'C' }));

      const self = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: a.id, related_person_id: a.id, type: 'parent' },
      });
      expect(self.statusCode).toBe(400);
      expect(JSON.parse(self.body).error.code).toBe('INVALID_RELATIONSHIP');

      const ab = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: a.id, related_person_id: b.id, type: 'parent' },
      });
      expect(ab.statusCode).toBe(201);

      const bc = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: b.id, related_person_id: c.id, type: 'parent' },
      });
      expect(bc.statusCode).toBe(201);

      const cycle = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: c.id, related_person_id: a.id, type: 'parent' },
      });
      expect(cycle.statusCode).toBe(400);
      expect(JSON.parse(cycle.body).error.code).toBe('INVALID_RELATIONSHIP');

      const dup = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: a.id, related_person_id: b.id, type: 'parent' },
      });
      expect(dup.statusCode).toBe(409);
      expect(JSON.parse(dup.body).error.code).toBe('RELATIONSHIP_EXISTS');

      const spouse = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: a.id, related_person_id: c.id, type: 'spouse' },
      });
      expect(spouse.statusCode).toBe(201);
      const reverse = await server.inject({
        method: 'POST',
        url: `/v1/families/${familyId}/relationships`,
        headers: await auth(memberToken),
        payload: { person_id: c.id, related_person_id: a.id, type: 'spouse' },
      });
      expect(reverse.statusCode).toBe(409);
      expect(JSON.parse(reverse.body).error.code).toBe('RELATIONSHIP_EXISTS');

      const listed = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(memberToken),
      });
      expect(JSON.parse(listed.body).relationships.length).toBe(3);

      const otherDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/relationships/${JSON.parse(ab.body).id}`,
        headers: await auth(otherToken),
      });
      expect(otherDelete.statusCode).toBe(403);

      const creatorDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/relationships/${JSON.parse(ab.body).id}`,
        headers: await auth(memberToken),
      });
      expect(creatorDelete.statusCode).toBe(204);

      const stewardDelete = await server.inject({
        method: 'DELETE',
        url: `/v1/relationships/${JSON.parse(spouse.body).id}`,
        headers: await auth(stewardToken),
      });
      expect(stewardDelete.statusCode).toBe(204);
    });
  });

  describe('person invites', () => {
    it('is steward-only; links account_id on accept; PERSON_ALREADY_LINKED and INVITE_INVALID', async () => {
      const created = await createPerson(memberToken, { name: 'ลิงก์ฉัน' });
      const id = createdPerson(created).id;

      const memberInvite = await server.inject({
        method: 'POST',
        url: `/v1/people/${id}/invites`,
        headers: await auth(memberToken),
        payload: { email: other.email },
      });
      expect(memberInvite.statusCode).toBe(403);

      const invite = await server.inject({
        method: 'POST',
        url: `/v1/people/${id}/invites`,
        headers: await auth(stewardToken),
        payload: { email: other.email },
      });
      expect(invite.statusCode).toBe(201);
      expect(JSON.parse(invite.body).person_id).toBe(id);
      expect(JSON.parse(invite.body).url).toContain('/invites/');

      const pendingList = await server.inject({
        method: 'GET',
        url: `/v1/families/${familyId}/people`,
        headers: await auth(memberToken),
      });
      expect(JSON.parse(pendingList.body).people.find((row: { id: string }) => row.id === id).invite_status).toBe(
        'pending'
      );

      const accepted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${tokenFromInviteUrl(JSON.parse(invite.body).url)}/accept`,
        headers: await auth(otherToken),
        payload: {},
      });
      expect(accepted.statusCode).toBe(200);
      expect(JSON.parse(accepted.body)).toEqual({ family_id: familyId, person_id: id });

      const [row] = await db.select().from(people).where(eq(people.id, id));
      expect(row.accountId).toBe(other.id);

      const again = await server.inject({
        method: 'POST',
        url: `/v1/people/${id}/invites`,
        headers: await auth(stewardToken),
        payload: { email: outsider.email },
      });
      expect(again.statusCode).toBe(409);
      expect(JSON.parse(again.body).error.code).toBe('PERSON_ALREADY_LINKED');

      const doomed = await createPerson(memberToken, { name: 'ลบแล้ว' });
      const doomedId = createdPerson(doomed).id;
      await server.inject({
        method: 'DELETE',
        url: `/v1/people/${doomedId}`,
        headers: await auth(stewardToken),
      });
      const invalid = await server.inject({
        method: 'POST',
        url: `/v1/people/${doomedId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: outsider.email },
      });
      expect(invalid.statusCode).toBe(410);
      expect(JSON.parse(invalid.body).error.code).toBe('INVITE_INVALID');

      const live = await createPerson(memberToken, { name: 'จะถูกลบ' });
      const liveId = createdPerson(live).id;
      const pendingInvite = await server.inject({
        method: 'POST',
        url: `/v1/people/${liveId}/invites`,
        headers: await auth(stewardToken),
        payload: { email: outsider.email },
      });
      await server.inject({
        method: 'DELETE',
        url: `/v1/people/${liveId}`,
        headers: await auth(stewardToken),
      });
      const acceptDeleted = await server.inject({
        method: 'POST',
        url: `/v1/invites/${tokenFromInviteUrl(JSON.parse(pendingInvite.body).url)}/accept`,
        headers: await auth(outsiderToken),
        payload: {},
      });
      expect(acceptDeleted.statusCode).toBe(410);
      expect(JSON.parse(acceptDeleted.body).error.code).toBe('INVITE_INVALID');
    });
  });

  describe('avatar_media_id', () => {
    it('returns 409 MEDIA_NOT_READY when not completed and 422 UPLOAD_MISMATCH for wrong purpose or family', async () => {
      const person = createdPerson(await createPerson(memberToken, { name: 'รูป' }));

      const [pending] = await db
        .insert(media)
        .values({
          familyId,
          uploaderAccountId: member.id,
          storageKey: `${familyId}/${crypto.randomUUID()}`,
          contentType: 'image/jpeg',
          sizeBytes: 12,
          status: 'pending',
          purpose: 'avatar',
        })
        .returning();

      const notReady = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${person.id}`,
        headers: await auth(stewardToken),
        payload: { avatar_media_id: pending.id },
      });
      expect(notReady.statusCode).toBe(409);
      expect(JSON.parse(notReady.body).error.code).toBe('MEDIA_NOT_READY');

      const [story] = await db
        .insert(media)
        .values({
          familyId,
          uploaderAccountId: member.id,
          storageKey: `${familyId}/${crypto.randomUUID()}`,
          contentType: 'image/jpeg',
          sizeBytes: 12,
          status: 'ready',
          purpose: 'story',
        })
        .returning();
      const wrongPurpose = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${person.id}`,
        headers: await auth(stewardToken),
        payload: { avatar_media_id: story.id },
      });
      expect(wrongPurpose.statusCode).toBe(422);
      expect(JSON.parse(wrongPurpose.body).error).toMatchObject({
        code: 'UPLOAD_MISMATCH',
        field: 'avatar_media_id',
      });

      const otherFamily = await server.inject({
        method: 'POST',
        url: '/v1/families',
        headers: await auth(outsiderToken),
        payload: { name: 'บ้านอื่น' },
      });
      const otherFamilyId = JSON.parse(otherFamily.body).id;
      const [foreign] = await db
        .insert(media)
        .values({
          familyId: otherFamilyId,
          uploaderAccountId: outsider.id,
          storageKey: `${otherFamilyId}/${crypto.randomUUID()}`,
          contentType: 'image/jpeg',
          sizeBytes: 12,
          status: 'ready',
          purpose: 'avatar',
        })
        .returning();
      const wrongFamily = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${person.id}`,
        headers: await auth(stewardToken),
        payload: { avatar_media_id: foreign.id },
      });
      expect(wrongFamily.statusCode).toBe(422);
      expect(JSON.parse(wrongFamily.body).error.code).toBe('UPLOAD_MISMATCH');

      const missing = await server.inject({
        method: 'PATCH',
        url: `/v1/people/${person.id}`,
        headers: await auth(stewardToken),
        payload: { avatar_media_id: UNKNOWN_UUID },
      });
      expect(missing.statusCode).toBe(400);
      expect(JSON.parse(missing.body).error.code).toBe('INVALID_INPUT');
    });
  });
});
