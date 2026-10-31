import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MEDIA_AVATAR_COVER_TTL_SECONDS,
  eventResponseSchema,
  personResponseSchema,
} from '@still-with-you/contracts';
import { createTestJpeg } from '@still-with-you/image-variants';
import { eq } from 'drizzle-orm';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, media } from '../lib/db/index.js';
import { memoryMediaStorage } from '../lib/media/storage.js';
import { processPendingMediaJobs } from '../lib/media/jobs.js';

describe('Member cards + Memory page contract', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let steward: Awaited<ReturnType<typeof createTestAccount>>;
  let member: Awaited<ReturnType<typeof createTestAccount>>;
  let stewardToken: string;
  let memberToken: string;
  let familyId: string;
  let grandmaId: string;
  let grandpaId: string;

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
    return JSON.parse(res.body).person.id as string;
  }

  async function createEvent(token: string, title: string, personIds: string[], mediaIds: string[] = []) {
    const res = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: await auth(token),
      payload: { title, story: `เรื่อง${title}`, person_ids: personIds, media_ids: mediaIds },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  function signedPath(url: string | null | undefined) {
    if (!url) return null;
    const parsed = new URL(url);
    parsed.searchParams.delete('exp');
    return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
  }

  function expectHourTtl(url: string) {
    const exp = Number(new URL(url).searchParams.get('exp'));
    const remainingMs = exp - Date.now();
    expect(remainingMs).toBeGreaterThan((MEDIA_AVATAR_COVER_TTL_SECONDS - 30) * 1000);
    expect(remainingMs).toBeLessThan((MEDIA_AVATAR_COVER_TTL_SECONDS + 30) * 1000);
  }

  function expectExpiresAround(iso: string | null | undefined, ttlSeconds: number) {
    expect(iso).toBeTruthy();
    const remainingMs = new Date(iso!).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan((ttlSeconds - 30) * 1000);
    expect(remainingMs).toBeLessThan((ttlSeconds + 30) * 1000);
  }

  function keyFromUrl(url: string) {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/read\//, ''));
  }

  async function readyMedia(token: string, purpose: 'avatar' | 'story' = 'story', process = true) {
    const jpeg = await createTestJpeg({ width: 400, height: 300 });
    const started = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/media/uploads`,
      headers: await auth(token),
      payload: { content_type: 'image/jpeg', size_bytes: jpeg.length, purpose },
    });
    expect(started.statusCode).toBe(201);
    const { media_id } = JSON.parse(started.body);
    await memoryMediaStorage.upload(`${familyId}/${media_id}`, jpeg, 'image/jpeg');
    const completed = await server.inject({
      method: 'POST',
      url: `/v1/media/${media_id}/complete`,
      headers: await auth(token),
    });
    expect(completed.statusCode).toBe(200);
    if (process) await processPendingMediaJobs();
    return media_id as string;
  }

  beforeEach(async () => {
    memoryMediaStorage.reset();
    server = await createTestServer();
    await cleanupTestData();
    memoryMediaStorage.reset();

    steward = await createTestAccount('mc-steward', 'mc-steward@example.com', 'Steward');
    member = await createTestAccount('mc-member', 'mc-member@example.com', 'Member');
    stewardToken = await generateTestToken(steward.authId, steward.email!);
    memberToken = await generateTestToken(member.authId, member.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: await auth(stewardToken),
      payload: { name: 'บ้านการ์ด' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values({ familyId, accountId: member.id, role: 'member' });

    grandmaId = await createPerson(stewardToken, 'ยาย');
    grandpaId = await createPerson(stewardToken, 'ปู่');
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
    memoryMediaStorage.reset();
  });

  it('memory_count on people list and home cards matches GET /v1/people/{id}/events', async () => {
    const archived = await createEvent(stewardToken, 'เรื่องเก่า', [grandmaId]);
    await createEvent(memberToken, 'เรื่องใหม่', [grandmaId]);
    await createEvent(stewardToken, 'เรื่องปู่', [grandpaId]);
    await createEvent(stewardToken, 'ไม่มีใคร', []);

    const archivedRes = await server.inject({
      method: 'POST',
      url: `/v1/events/${archived.id}/archive`,
      headers: await auth(stewardToken),
    });
    expect(archivedRes.statusCode).toBe(200);

    async function eventCount(personId: string, token: string) {
      const list = await server.inject({
        method: 'GET',
        url: `/v1/people/${personId}/events`,
        headers: await auth(token),
      });
      expect(list.statusCode).toBe(200);
      return JSON.parse(list.body).events.length as number;
    }

    const stewardGrandmaEvents = await eventCount(grandmaId, stewardToken);
    const stewardGrandpaEvents = await eventCount(grandpaId, stewardToken);
    const memberGrandmaEvents = await eventCount(grandmaId, memberToken);
    const memberGrandpaEvents = await eventCount(grandpaId, memberToken);

    expect(stewardGrandmaEvents).toBe(2);
    expect(memberGrandmaEvents).toBe(1);
    expect(stewardGrandpaEvents).toBe(1);
    expect(memberGrandpaEvents).toBe(1);

    const stewardPeople = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(stewardToken),
    });
    expect(stewardPeople.statusCode).toBe(200);
    const stewardRows = JSON.parse(stewardPeople.body).people;
    const stewardGrandma = personResponseSchema.parse(stewardRows.find((row: { id: string }) => row.id === grandmaId));
    const stewardGrandpa = personResponseSchema.parse(stewardRows.find((row: { id: string }) => row.id === grandpaId));
    expect(stewardGrandma.name).toBe('ยาย');
    expect(stewardGrandma.memory_count).toBe(stewardGrandmaEvents);
    expect(stewardGrandpa.memory_count).toBe(stewardGrandpaEvents);

    const memberPeople = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    const memberRows = JSON.parse(memberPeople.body).people;
    expect(personResponseSchema.parse(memberRows.find((row: { id: string }) => row.id === grandmaId)).memory_count).toBe(
      memberGrandmaEvents
    );
    expect(personResponseSchema.parse(memberRows.find((row: { id: string }) => row.id === grandpaId)).memory_count).toBe(
      memberGrandpaEvents
    );

    const one = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandmaId}`,
      headers: await auth(memberToken),
    });
    expect(personResponseSchema.parse(JSON.parse(one.body)).memory_count).toBe(memberGrandmaEvents);

    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandmaId, grandpaId] },
    });
    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(home.statusCode).toBe(200);
    const cards = JSON.parse(home.body).focus;
    expect(cards[0].person.name).toBe('ยาย');
    expect(cards[0].memory_count).toBe(memberGrandmaEvents);
    expect(cards[1].person.name).toBe('ปู่');
    expect(cards[1].memory_count).toBe(memberGrandpaEvents);
  });

  it('signs avatar_url from the 300x300 variant and includes placeholder + full_url', async () => {
    const avatarId = await readyMedia(memberToken, 'avatar');
    const storyId = await readyMedia(memberToken, 'story');

    const attached = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${grandmaId}`,
      headers: await auth(stewardToken),
      payload: { avatar_media_id: avatarId },
    });
    expect(attached.statusCode).toBe(200);
    const patched = personResponseSchema.parse(JSON.parse(attached.body));
    expect(patched.avatar_media_id).toBe(avatarId);
    expect(patched.avatar_url).toBeTruthy();
    expect(keyFromUrl(patched.avatar_url!)).toBe(`${familyId}/${avatarId}/avatar.webp`);
    expect(patched.avatar_placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(keyFromUrl(patched.full_url!)).toMatch(new RegExp(`${avatarId}/full\\.(webp|jpg)$`));
    expectHourTtl(patched.avatar_url!);
    expectHourTtl(patched.full_url!);
    expectExpiresAround(patched.avatar_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(patched.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);

    const listed = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/people`,
      headers: await auth(memberToken),
    });
    const grandma = personResponseSchema.parse(
      JSON.parse(listed.body).people.find((row: { id: string }) => row.id === grandmaId)
    );
    expect(signedPath(grandma.avatar_url)).toBe(signedPath(patched.avatar_url));

    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandmaId] },
    });
    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    const card = JSON.parse(home.body).focus[0];
    expect(signedPath(card.avatar_url)).toBe(signedPath(patched.avatar_url));
    expect(signedPath(card.photo_url)).toBe(signedPath(patched.avatar_url));
    expectExpiresAround(card.avatar_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(card.photo_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(card.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);

    const grandpa = personResponseSchema.parse(
      JSON.parse(listed.body).people.find((row: { id: string }) => row.id === grandpaId)
    );
    expect(grandpa.avatar_url).toBeNull();
    expect(grandpa.avatar_url_expires_at).toBeNull();
    expect(grandpa.full_url).toBeNull();
    expect(grandpa.full_url_expires_at).toBeNull();
    expect(grandpa.avatar_placeholder).toBeNull();

    const wrongPurpose = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${grandpaId}`,
      headers: await auth(stewardToken),
      payload: { avatar_media_id: storyId },
    });
    expect(wrongPurpose.statusCode).toBe(422);

    await db.update(media).set({ status: 'pending' }).where(eq(media.id, avatarId));
    const pending = await server.inject({
      method: 'GET',
      url: `/v1/people/${grandmaId}`,
      headers: await auth(memberToken),
    });
    const pendingPerson = personResponseSchema.parse(JSON.parse(pending.body));
    expect(pendingPerson.avatar_url).toBeNull();
    expect(pendingPerson.avatar_url_expires_at).toBeNull();
    expect(pendingPerson.full_url).toBeNull();
    expect(pendingPerson.full_url_expires_at).toBeNull();
    expect(pendingPerson.avatar_placeholder).toBeNull();
  });

  it('returns paused and a stable cover_url from the first photo of the earliest published story', async () => {
    const firstPhoto = await readyMedia(stewardToken, 'story');
    const laterPhoto = await readyMedia(memberToken, 'story');

    const created = await createEvent(stewardToken, 'ทริปทะเล', [grandmaId], [firstPhoto]);
    const event = eventResponseSchema.parse(created);
    expect(event.paused).toBe(false);
    expect(event.cover_url).toContain('https://media.test/read/');
    expect(keyFromUrl(event.cover_url!)).toBe(`${familyId}/${firstPhoto}/cover_detail.webp`);
    expect(event.cover_placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(keyFromUrl(event.full_url!)).toMatch(new RegExp(`${firstPhoto}/full\\.(webp|jpg)$`));
    expectHourTtl(event.cover_url!);
    expectHourTtl(event.full_url!);
    expectExpiresAround(event.cover_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(event.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    const firstCover = event.cover_url;

    const second = await server.inject({
      method: 'POST',
      url: `/v1/events/${event.id}/contributions`,
      headers: await auth(memberToken),
      payload: { story: 'เรื่องหลัง', media_ids: [laterPhoto] },
    });
    expect(second.statusCode).toBe(201);

    const got = await server.inject({
      method: 'GET',
      url: `/v1/events/${event.id}`,
      headers: await auth(memberToken),
    });
    const afterSecond = eventResponseSchema.parse(JSON.parse(got.body));
    expect(signedPath(afterSecond.cover_url)).toBe(signedPath(firstCover));
    expect(afterSecond.paused).toBe(false);

    const archived = await server.inject({
      method: 'POST',
      url: `/v1/events/${event.id}/archive`,
      headers: await auth(stewardToken),
    });
    expect(eventResponseSchema.parse(JSON.parse(archived.body)).paused).toBe(true);
  });

  it('uses cover_card 256 on home and cover_detail 684x400 on event detail', async () => {
    const avatarId = await readyMedia(memberToken, 'avatar');
    await server.inject({
      method: 'PATCH',
      url: `/v1/people/${grandmaId}`,
      headers: await auth(stewardToken),
      payload: { avatar_media_id: avatarId },
    });

    const photo = await readyMedia(stewardToken, 'story');
    const created = await createEvent(stewardToken, 'ปก', [grandmaId], [photo]);
    const detail = eventResponseSchema.parse(created);
    expect(keyFromUrl(detail.cover_url!)).toBe(`${familyId}/${photo}/cover_detail.webp`);
    expectHourTtl(detail.cover_url!);

    await server.inject({
      method: 'PUT',
      url: `/v1/families/${familyId}/focus`,
      headers: await auth(memberToken),
      payload: { person_ids: [grandmaId] },
    });
    const home = await server.inject({
      method: 'GET',
      url: `/v1/families/${familyId}/home`,
      headers: await auth(memberToken),
    });
    expect(home.statusCode).toBe(200);
    const body = JSON.parse(home.body);
    expect(keyFromUrl(body.focus[0].avatar_url)).toBe(`${familyId}/${avatarId}/avatar.webp`);
    expect(body.focus[0].avatar_placeholder).toMatch(/^data:image\/webp;base64,/);
    const card = body.recent_memories.find((event: { id: string }) => event.id === detail.id);
    expect(keyFromUrl(card.cover_url)).toBe(`${familyId}/${photo}/cover_card.webp`);
    expect(card.cover_placeholder).toMatch(/^data:image\/webp;base64,/);
    expectHourTtl(card.cover_url);
    expectExpiresAround(card.cover_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(card.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
  });

  it('falls back to the original signed URL and null placeholder when variants are not ready', async () => {
    const avatarId = await readyMedia(memberToken, 'avatar', false);
    const attached = await server.inject({
      method: 'PATCH',
      url: `/v1/people/${grandmaId}`,
      headers: await auth(stewardToken),
      payload: { avatar_media_id: avatarId },
    });
    const patched = personResponseSchema.parse(JSON.parse(attached.body));
    expect(keyFromUrl(patched.avatar_url!)).toBe(`${familyId}/${avatarId}`);
    expect(patched.avatar_placeholder).toBeNull();
    expect(keyFromUrl(patched.full_url!)).toBe(`${familyId}/${avatarId}`);
    expectHourTtl(patched.avatar_url!);
    expectHourTtl(patched.full_url!);
    expectExpiresAround(patched.avatar_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(patched.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);

    const photo = await readyMedia(stewardToken, 'story', false);
    const created = await createEvent(stewardToken, 'ยังไม่แปร', [grandmaId], [photo]);
    const event = eventResponseSchema.parse(created);
    expect(keyFromUrl(event.cover_url!)).toBe(`${familyId}/${photo}`);
    expect(event.cover_placeholder).toBeNull();
    expect(keyFromUrl(event.full_url!)).toBe(`${familyId}/${photo}`);
    expectHourTtl(event.cover_url!);
    expectHourTtl(event.full_url!);
    expectExpiresAround(event.cover_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
    expectExpiresAround(event.full_url_expires_at, MEDIA_AVATAR_COVER_TTL_SECONDS);
  });
});
