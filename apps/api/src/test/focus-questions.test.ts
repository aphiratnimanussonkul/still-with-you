import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, people, questionBank, questionSkips } from '../lib/db/index.js';
import { eq } from 'drizzle-orm';

describe('Focus people + quick questions', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let familyId: string;
  let grandma: { id: string; displayName: string };
  let grandpa: { id: string; displayName: string };
  let q01: { id: string; key: string; textTh: string };
  let q02: { id: string; key: string };

  async function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  beforeEach(async () => {
    server = await createTestServer();
    await cleanupTestData();

    steward = await createTestAccount('auth-focus-steward', 'steward-fq@example.com', 'Steward');
    member = await createTestAccount('auth-focus-member', 'member-fq@example.com', 'Member');
    outsider = await createTestAccount('auth-focus-out', 'out-fq@example.com', 'Outsider');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านเรา' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values({ familyId, accountId: member.id, role: 'member' });

    [grandma] = await db.insert(people).values({ familyId, displayName: 'ยาย' }).returning();
    [grandpa] = await db.insert(people).values({ familyId, displayName: 'ปู่' }).returning();

    const questions = await db.select().from(questionBank);
    q01 = questions.find((row) => row.key === 'q01')!;
    q02 = questions.find((row) => row.key === 'q02')!;
    expect(questions).toHaveLength(20);
    expect(q01).toBeTruthy();
  });

  afterEach(async () => {
    await db.update(questionBank).set({ active: true });
    await server.close();
    await cleanupTestData();
  });

  it('returns an empty focus list', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).items).toEqual([]);
  });

  it('replaces focus people in array order and counts active memories', async () => {
    await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(stewardToken),
      payload: { title: 'วันเกิด', story: 'มีเค้ก', person_ids: [grandma.id] },
    });

    const put = await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandpa.id, grandma.id] },
    });
    expect(put.statusCode).toBe(200);
    const items = JSON.parse(put.body).items;
    expect(items).toHaveLength(2);
    expect(items[0].person.id).toBe(grandpa.id);
    expect(items[0].person.display_name).toBe('ปู่');
    expect(items[0].position).toBe(0);
    expect(items[0].photo_url).toBeNull();
    expect(items[0].memory_count).toBe(0);
    expect(items[1].person.id).toBe(grandma.id);
    expect(items[1].position).toBe(1);
    expect(items[1].memory_count).toBe(1);

    const got = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(got.body).items.map((row: { person: { id: string } }) => row.person.id)).toEqual([
      grandpa.id,
      grandma.id,
    ]);
  });

  it('allows an empty focus set', async () => {
    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id] },
    });
    const put = await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [] },
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).items).toEqual([]);
  });

  it('returns 400 INVALID_INPUT for duplicate person_ids', async () => {
    const put = await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id, grandma.id] },
    });
    expect(put.statusCode).toBe(400);
    expect(JSON.parse(put.body).error.code).toBe('INVALID_INPUT');
    expect(JSON.parse(put.body).error.field).toBe('person_ids');
  });

  it('returns 400 INVALID_INPUT for a person in another family', async () => {
    const otherFamily = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(outsiderToken),
      payload: { name: 'บ้านอื่น' },
    });
    const otherFamilyId = JSON.parse(otherFamily.body).id;
    const [stranger] = await db
      .insert(people)
      .values({ familyId: otherFamilyId, displayName: 'คนนอก' })
      .returning();

    const put = await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [stranger.id] },
    });
    expect(put.statusCode).toBe(400);
    expect(JSON.parse(put.body).error.code).toBe('INVALID_INPUT');
    expect(JSON.parse(put.body).error.field).toBe('person_ids');
  });

  it('returns 422 TOO_MANY_FOCUS above 10 people', async () => {
    const extras = await db
      .insert(people)
      .values(Array.from({ length: 9 }, (_, i) => ({ familyId, displayName: `คน${i}` })))
      .returning();
    const ids = [grandma.id, grandpa.id, ...extras.map((row) => row.id)];
    expect(ids).toHaveLength(11);

    const put = await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: ids },
    });
    expect(put.statusCode).toBe(422);
    expect(JSON.parse(put.body).error.code).toBe('TOO_MANY_FOCUS');
  });

  it('returns 403 FORBIDDEN for a non-member', async () => {
    const getFocus = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(outsiderToken),
    });
    expect(getFocus.statusCode).toBe(403);
    expect(JSON.parse(getFocus.body).error.code).toBe('FORBIDDEN');

    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(outsiderToken),
    });
    expect(home.statusCode).toBe(403);
  });

  it('picks an active unanswered question with the name substituted', async () => {
    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id] },
    });
    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(home.statusCode).toBe(200);
    const body = JSON.parse(home.body);
    expect(body.focus).toHaveLength(1);
    expect(body.quick_question.question_id).toBe(q01.id);
    expect(body.quick_question.key).toBe('q01');
    expect(body.quick_question.person.id).toBe(grandma.id);
    expect(body.quick_question.text).toBe('อาหารโปรดของยายคืออะไร');
    expect(body.recent_memories).toEqual([]);
  });

  it('returns null quick_question when focus is empty', async () => {
    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(home.body).quick_question).toBeNull();
  });

  it('does not re-offer a question the caller already answered', async () => {
    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id] },
    });
    const created = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    expect(created.statusCode).toBe(201);

    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(home.body).quick_question.key).toBe('q02');
  });

  it('skips a question for 30 days and re-offers after the window', async () => {
    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id] },
    });
    const skipped = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts/skip`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id },
    });
    expect(skipped.statusCode).toBe(204);

    const afterSkip = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(afterSkip.body).quick_question.key).toBe('q02');

    await db
      .update(questionSkips)
      .set({ skippedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(
        eq(questionSkips.accountId, member.id)
      );

    const afterWindow = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(afterWindow.body).quick_question.key).toBe('q01');
  });

  it('rejects empty or missing answer_text', async () => {
    const empty = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(JSON.parse(empty.body).error.code).toBe('ANSWER_REQUIRED');
    expect(JSON.parse(empty.body).error.field).toBe('answer_text');

    const missing = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id },
    });
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body).error.code).toBe('ANSWER_REQUIRED');
    expect(JSON.parse(missing.body).error.field).toBe('answer_text');
  });

  it('rejects unknown or inactive questions', async () => {
    const unknown = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: '00000000-0000-4000-a000-000000000099', answer_text: 'ไม่รู้' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(JSON.parse(unknown.body).error.code).toBe('INVALID_INPUT');
    expect(JSON.parse(unknown.body).error.field).toBe('question_id');

    await db.update(questionBank).set({ active: false }).where(eq(questionBank.id, q01.id));
    const inactive = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    expect(inactive.statusCode).toBe(400);
    expect(JSON.parse(inactive.body).error.field).toBe('question_id');
  });

  it('returns 409 ALREADY_ANSWERED with fact_id on duplicate', async () => {
    const first = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    expect(first.statusCode).toBe(201);
    const factId = JSON.parse(first.body).id;

    const dup = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'อีกคำตอบ' },
    });
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.body).error.code).toBe('ALREADY_ANSWERED');
    expect(JSON.parse(dup.body).error.details.fact_id).toBe(factId);
  });

  it('lists facts grouped by question with can_edit / can_delete', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    const factId = JSON.parse(created.body).id;

    const asAuthor = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
    });
    expect(asAuthor.statusCode).toBe(200);
    const groups = JSON.parse(asAuthor.body).groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].question.key).toBe('q01');
    expect(groups[0].question.text).toBe('อาหารโปรดของยายคืออะไร');
    expect(groups[0].answers[0].id).toBe(factId);
    expect(groups[0].answers[0].can_edit).toBe(true);
    expect(groups[0].answers[0].can_delete).toBe(true);
    expect(groups[0].answers[0].author.account_id).toBe(member.id);

    const asSteward = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(stewardToken),
    });
    const stewardAnswer = JSON.parse(asSteward.body).groups[0].answers[0];
    expect(stewardAnswer.can_edit).toBe(false);
    expect(stewardAnswer.can_delete).toBe(true);
  });

  it('lets only the author patch a fact', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    const factId = JSON.parse(created.body).id;

    const asSteward = await server.inject({
      method: 'PATCH',
      url: `/v1/facts/${factId}`,
      headers: await auth(stewardToken),
      payload: { answer_text: 'แก้ไม่ได้' },
    });
    expect(asSteward.statusCode).toBe(403);

    const asAuthor = await server.inject({
      method: 'PATCH',
      url: `/v1/facts/${factId}`,
      headers: await auth(memberToken),
      payload: { answer_text: '  แกงเขียวหวาน  ' },
    });
    expect(asAuthor.statusCode).toBe(200);
    expect(JSON.parse(asAuthor.body).answer_text).toBe('แกงเขียวหวาน');

    const emptyPatch = await server.inject({
      method: 'PATCH',
      url: `/v1/facts/${factId}`,
      headers: await auth(memberToken),
      payload: { answer_text: '   ' },
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(JSON.parse(emptyPatch.body).error.code).toBe('ANSWER_REQUIRED');
  });

  it('lets the author or steward soft-delete, but not another member', async () => {
    const first = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ต้มยำ' },
    });
    const factId = JSON.parse(first.body).id;

    const asOutsider = await server.inject({
      method: 'DELETE',
      url: `/v1/facts/${factId}`,
      headers: await auth(outsiderToken),
    });
    expect(asOutsider.statusCode).toBe(403);

    const asAuthor = await server.inject({
      method: 'DELETE',
      url: `/v1/facts/${factId}`,
      headers: await auth(memberToken),
    });
    expect(asAuthor.statusCode).toBe(204);

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(listed.body).groups).toEqual([]);

    const again = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(memberToken),
      payload: { question_id: q01.id, answer_text: 'ใหม่' },
    });
    expect(again.statusCode).toBe(201);

    const stewardFact = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(stewardToken),
      payload: { question_id: q02.id, answer_text: 'ทองหยิบ' },
    });
    const stewardFactId = JSON.parse(stewardFact.body).id;

    const asOtherMember = await server.inject({
      method: 'DELETE',
      url: `/v1/facts/${stewardFactId}`,
      headers: await auth(memberToken),
    });
    expect(asOtherMember.statusCode).toBe(403);

    const asSteward = await server.inject({
      method: 'DELETE',
      url: `/v1/facts/${stewardFactId}`,
      headers: await auth(stewardToken),
    });
    expect(asSteward.statusCode).toBe(204);
  });

  it('excludes archived events from recent_memories and memory_count', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(stewardToken),
      payload: { title: 'เก็บแล้ว', story: 'เรื่องเก่า', person_ids: [grandma.id] },
    });
    const eventId = JSON.parse(created.body).id;
    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandma.id] },
    });

    const before = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(before.body).recent_memories).toHaveLength(1);
    expect(JSON.parse(before.body).focus[0].memory_count).toBe(1);

    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/archive`,
      headers: await auth(stewardToken),
    });

    const after = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(JSON.parse(after.body).recent_memories).toEqual([]);
    expect(JSON.parse(after.body).focus[0].memory_count).toBe(0);
  });

  it('returns 403 when a non-member reads or writes facts', async () => {
    const getFacts = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(outsiderToken),
    });
    expect(getFacts.statusCode).toBe(403);

    const post = await server.inject({
      method: 'POST',
      url: `/v1/people/${grandma.id}/facts`,
      headers: await auth(outsiderToken),
      payload: { question_id: q01.id, answer_text: 'ไม่ควรได้' },
    });
    expect(post.statusCode).toBe(403);
  });
});
