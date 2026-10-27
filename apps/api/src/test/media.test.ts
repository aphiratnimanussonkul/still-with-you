import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestServer, createTestAccount, generateTestToken, cleanupTestData } from './helpers.js';
import { db, familyMembers, media, mediaVariants, contributions, events } from '../lib/db/index.js';
import { and, eq } from 'drizzle-orm';
import { EVENT_DELETE_CONFIRM_TEXT } from '@still-with-you/contracts';
import { createTestJpeg } from '@still-with-you/image-variants';
import { memoryMediaStorage } from '../lib/media/storage.js';
import { backfillMediaVariants, cleanupOrphanMedia, processPendingMediaJobs } from '../lib/media/jobs.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const JPEG_1X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xd9,
]);

describe('Media uploads (v0.5)', () => {
  let server: Awaited<ReturnType<typeof createTestServer>>;
  let author: Awaited<ReturnType<typeof createTestAccount>>;
  let other: Awaited<ReturnType<typeof createTestAccount>>;
  let outsider: Awaited<ReturnType<typeof createTestAccount>>;
  let authorToken: string;
  let otherToken: string;
  let outsiderToken: string;
  let familyId: string;
  let eventId: string;

  beforeEach(async () => {
    memoryMediaStorage.reset();
    server = await createTestServer();
    await cleanupTestData();
    memoryMediaStorage.reset();

    author = await createTestAccount('auth-media-author', 'author@example.com', 'Author');
    other = await createTestAccount('auth-media-other', 'other@example.com', 'Other');
    outsider = await createTestAccount('auth-media-out', 'out@example.com', 'Outsider');
    authorToken = await generateTestToken(author.authId, author.email!);
    otherToken = await generateTestToken(other.authId, other.email!);
    outsiderToken = await generateTestToken(outsider.authId, outsider.email!);

    const familyRes = await server.inject({
      method: 'POST',
      url: '/v1/families',
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { name: 'Photo Family' },
    });
    familyId = JSON.parse(familyRes.body).id;
    await db.insert(familyMembers).values({ familyId, accountId: other.id, role: 'member' });

    const eventRes = await server.inject({
      method: 'POST',
      url: `/v1/families/${familyId}/events`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { title: 'วันเกิด', story: 'มีรูป' },
    });
    eventId = JSON.parse(eventRes.body).id;
  });

  afterEach(async () => {
    await server.close();
    await cleanupTestData();
    memoryMediaStorage.reset();
  });

  async function startUpload(
    token: string,
    fid: string,
    contentType = 'image/jpeg',
    sizeBytes = JPEG_1X1.length
  ) {
    return server.inject({
      method: 'POST',
      url: `/v1/families/${fid}/media/uploads`,
      headers: { authorization: `Bearer ${token}` },
      payload: { content_type: contentType, size_bytes: sizeBytes },
    });
  }

  async function putAndComplete(token: string, mediaId: string, body: Buffer, contentType: string) {
    const key = `${familyId}/${mediaId}`;
    await memoryMediaStorage.upload(key, body, contentType);
    return server.inject({
      method: 'POST',
      url: `/v1/media/${mediaId}/complete`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function readyJpeg(token = authorToken) {
    const jpeg = await createTestJpeg({ width: 120, height: 80 });
    const started = await startUpload(token, familyId, 'image/jpeg', jpeg.length);
    expect(started.statusCode).toBe(201);
    const { media_id } = JSON.parse(started.body);
    const completed = await putAndComplete(token, media_id, jpeg, 'image/jpeg');
    expect(completed.statusCode).toBe(200);
    await processPendingMediaJobs();
    return media_id as string;
  }

  it('happy path: signed upload, complete, attach, signed read URLs', async () => {
    const jpeg = await createTestJpeg({ width: 120, height: 80 });
    const started = await startUpload(authorToken, familyId, 'image/jpeg', jpeg.length);
    expect(started.statusCode).toBe(201);
    const body = JSON.parse(started.body);
    expect(body.media_id).toBeTruthy();
    expect(body.upload_url).toContain('https://');
    expect(body.max_bytes).toBe(20971520);
    expect(body.max_per_story).toBe(20);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const completed = await putAndComplete(authorToken, body.media_id, jpeg, 'image/jpeg');
    expect(completed.statusCode).toBe(200);
    expect(JSON.parse(completed.body).status).toBe('uploaded');
    await processPendingMediaJobs();

    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'รูปวันนั้น', media_ids: [body.media_id] },
    });
    expect(created.statusCode).toBe(201);
    const story = JSON.parse(created.body);
    expect(story.media).toHaveLength(1);
    expect(story.media[0].status).toBe('ready');
    expect(story.media[0].url).toContain('https://');
    expect(story.media[0].thumb_url).toContain('https://');
    expect(story.media[0].full_url).toContain('https://');
    expect(story.media[0].thumb_url).toContain(encodeURIComponent(`${familyId}/${body.media_id}/cover_card.webp`));
    expect(story.media[0].expires_at).toBeTruthy();
  });

  it('returns 415 UNSUPPORTED_TYPE for disallowed content_type', async () => {
    const response = await startUpload(authorToken, familyId, 'image/gif', 12);
    expect(response.statusCode).toBe(415);
    expect(JSON.parse(response.body).error.code).toBe('UNSUPPORTED_TYPE');
  });

  it('returns 413 FILE_TOO_LARGE when size_bytes exceeds MEDIA_MAX_BYTES', async () => {
    const response = await startUpload(authorToken, familyId, 'image/jpeg', 20971521);
    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body).error.code).toBe('FILE_TOO_LARGE');
  });

  it('returns 422 UPLOAD_MISMATCH when png bytes are declared as jpeg', async () => {
    const started = await startUpload(authorToken, familyId, 'image/jpeg', PNG_1X1.length);
    const { media_id } = JSON.parse(started.body);
    const completed = await putAndComplete(authorToken, media_id, PNG_1X1, 'image/jpeg');
    expect(completed.statusCode).toBe(422);
    expect(JSON.parse(completed.body).error.code).toBe('UPLOAD_MISMATCH');
    const [row] = await db.select().from(media).where(eq(media.id, media_id));
    expect(row.status).toBe('failed');
    expect(memoryMediaStorage.objects.has(`${familyId}/${media_id}`)).toBe(false);
  });

  it('returns 409 MEDIA_NOT_READY when attaching a pending upload', async () => {
    const started = await startUpload(authorToken, familyId, 'image/jpeg', JPEG_1X1.length);
    const { media_id } = JSON.parse(started.body);
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'ยังไม่อัปโหลด', media_ids: [media_id] },
    });
    expect(created.statusCode).toBe(409);
    const err = JSON.parse(created.body).error;
    expect(err.code).toBe('MEDIA_NOT_READY');
    expect(err.details.media_ids).toEqual([media_id]);
  });

  it('returns 400 INVALID_INPUT for unknown media_ids', async () => {
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'ไม่มีรูปนี้', media_ids: ['00000000-0000-4000-8000-000000000099'] },
    });
    expect(created.statusCode).toBe(400);
    expect(JSON.parse(created.body).error.code).toBe('INVALID_INPUT');
    expect(JSON.parse(created.body).error.field).toBe('media_ids');
  });

  it('rejects a non-author attaching someone else\'s media', async () => {
    const mediaId = await readyJpeg(authorToken);
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { story: 'รูปของคนอื่น', media_ids: [mediaId] },
    });
    expect(created.statusCode).toBe(400);
    expect(JSON.parse(created.body).error.code).toBe('INVALID_INPUT');
  });

  it('rejects a non-member requesting signed URLs', async () => {
    const mediaId = await readyJpeg();
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'รูป', media_ids: [mediaId] },
    });
    const storyId = JSON.parse(created.body).id;
    const asOutsider = await server.inject({
      method: 'GET',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    expect(asOutsider.statusCode).toBe(404);
  });

  it('returns 422 TOO_MANY_PHOTOS above MEDIA_MAX_PER_CONTRIBUTION', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i += 1) {
      const [row] = await db
        .insert(media)
        .values({
          familyId,
          uploaderAccountId: author.id,
          storageKey: `${familyId}/bulk-${i}`,
          contentType: 'image/jpeg',
          sizeBytes: JPEG_1X1.length,
          status: 'uploaded',
        })
        .returning();
      ids.push(row.id);
    }
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'เยอะไป', media_ids: ids },
    });
    expect(created.statusCode).toBe(422);
    expect(JSON.parse(created.body).error.code).toBe('TOO_MANY_PHOTOS');
  });

  it('hides media URLs when the story is trashed', async () => {
    const mediaId = await readyJpeg();
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'จะถังขยะ', media_ids: [mediaId] },
    });
    const storyId = JSON.parse(created.body).id;
    await server.inject({
      method: 'POST',
      url: `/v1/contributions/${storyId}/trash`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    const got = await server.inject({
      method: 'GET',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    const story = JSON.parse(got.body);
    expect(story.media[0].url).toBeNull();
    expect(story.media[0].thumb_url).toBeNull();
    expect(story.media[0].full_url).toBeNull();
  });

  it('hides media URLs when the origin event is archived', async () => {
    const mediaId = await readyJpeg();
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'เหตุการณ์เก็บ', media_ids: [mediaId] },
    });
    const storyId = JSON.parse(created.body).id;
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/archive`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    const got = await server.inject({
      method: 'GET',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    expect(got.statusCode).toBe(200);
    expect(JSON.parse(got.body).media[0].url).toBeNull();

    const asOther = await server.inject({
      method: 'GET',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(asOther.statusCode).toBe(404);
  });

  it('purge deletes media rows and storage objects', async () => {
    const mediaId = await readyJpeg();
    const key = `${familyId}/${mediaId}`;
    expect(memoryMediaStorage.objects.has(key)).toBe(true);
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'จะลบ', media_ids: [mediaId] },
    });
    const storyId = JSON.parse(created.body).id;
    const purged = await server.inject({
      method: 'DELETE',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    expect(purged.statusCode).toBe(204);
    const leftover = await db.select().from(media).where(eq(media.id, mediaId));
    expect(leftover).toHaveLength(0);
    expect(memoryMediaStorage.objects.has(key)).toBe(false);
  });

  it('detaches and soft-deletes media removed on update', async () => {
    const mediaId = await readyJpeg();
    const created = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'มีรูป', media_ids: [mediaId] },
    });
    const storyId = JSON.parse(created.body).id;
    const patched = await server.inject({
      method: 'PATCH',
      url: `/v1/contributions/${storyId}`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { media_ids: [] },
    });
    expect(patched.statusCode).toBe(200);
    expect(JSON.parse(patched.body).media).toHaveLength(0);
    const [row] = await db.select().from(media).where(eq(media.id, mediaId));
    expect(row.storyId).toBeNull();
    expect(row.deletedAt).toBeTruthy();
  });

  it('deletes pending unattached media older than 24h', async () => {
    const started = await startUpload(authorToken, familyId, 'image/jpeg', JPEG_1X1.length);
    const { media_id } = JSON.parse(started.body);
    await db
      .update(media)
      .set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(media.id, media_id));
    const removed = await cleanupOrphanMedia(24);
    expect(removed).toBeGreaterThanOrEqual(1);
    const leftover = await db.select().from(media).where(eq(media.id, media_id));
    expect(leftover).toHaveLength(0);
  });

  it('permanent event delete removes media objects', async () => {
    const mediaId = await readyJpeg();
    const key = `${familyId}/${mediaId}`;
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/contributions`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { story: 'ติดอีเวนต์', media_ids: [mediaId] },
    });
    await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/archive`,
      headers: { authorization: `Bearer ${authorToken}` },
    });
    await db
      .update(events)
      .set({ archivedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(events.id, eventId));
    const deleted = await server.inject({
      method: 'POST',
      url: `/v1/events/${eventId}/delete`,
      headers: { authorization: `Bearer ${authorToken}` },
      payload: { confirm_text: EVENT_DELETE_CONFIRM_TEXT },
    });
    expect(deleted.statusCode).toBe(204);
    const leftover = await db.select().from(media).where(eq(media.id, mediaId));
    expect(leftover).toHaveLength(0);
    expect(memoryMediaStorage.objects.has(key)).toBe(false);
    const stories = await db.select().from(contributions).where(eq(contributions.originEventId, eventId));
    expect(stories.every((s) => s.status === 'trashed' || s.status === 'purged' || s.eventId === null)).toBe(
      true
    );
  });

  it('backfill generates missing variants and skips them on re-run', async () => {
    const jpeg = await createTestJpeg({ width: 100, height: 80 });
    const started = await startUpload(authorToken, familyId, 'image/jpeg', jpeg.length);
    const { media_id } = JSON.parse(started.body);
    const completed = await putAndComplete(authorToken, media_id, jpeg, 'image/jpeg');
    expect(completed.statusCode).toBe(200);

    const first = await backfillMediaVariants({ limit: 20 });
    expect(first.processed).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(media).where(eq(media.id, media_id));
    expect(row.placeholderWebp).toMatch(/^data:image\/webp;base64,/);
    const variants = await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, media_id));
    expect(variants).toHaveLength(4);

    const second = await backfillMediaVariants({ limit: 20 });
    expect(second.processed).toBe(0);
    expect(await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, media_id))).toHaveLength(4);

    await db
      .delete(mediaVariants)
      .where(and(eq(mediaVariants.mediaId, media_id), eq(mediaVariants.kind, 'avatar')));
    const third = await backfillMediaVariants({ limit: 20 });
    expect(third.processed).toBe(1);
    expect(await db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, media_id))).toHaveLength(4);
  });
});
